import { NextRequest, NextResponse } from "next/server";
import { formatUnits, encodeFunctionData } from "viem";
import { arcPublicClient } from "@/shared/lib/arc";
import { STRATEGY_REGISTRY_ABI } from "@/entities/strategy/model/abi";
import { dcwExecuteContract, dcwExecuteRaw, waitForTx, getExecutorAddress } from "@/shared/lib/dcw";
import { executeSwap, canSwap, type SwapToken } from "@/shared/lib/swap";
import { tokenByAddress } from "@/shared/lib/tokens";
import { env } from "@/shared/config/env";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const ERC20_TRANSFER_ABI = [{
  name: "transfer",
  type: "function",
  stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ type: "bool" }],
}] as const;

async function refundUSDC(to: `0x${string}`, amountPerPeriod: bigint): Promise<void> {
  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [to, amountPerPeriod],
  });
  const r = await dcwExecuteRaw(USDC_ADDRESS, data);
  const id = (r as { id?: string } | undefined)?.id;
  if (id) await waitForTx(id, 30_000);
}

const FAILED_STATES = new Set(["FAILED", "CANCELLED", "DENIED"]);

// Scheduler-agnostic strategy executor. Vercel Cron (daily on Hobby) hits this, but so can
// an external pinger (cron-job.org / GitHub Actions) for finer cadence, or a worker. All
// authenticate with CRON_SECRET. Idempotent + resumable: each run processes due strategies
// within a time budget; the contract's nextRunAt guard means an interrupted or repeated run
// can't double-execute (and we waitForTx so a fast pinger never resubmits an unmined one).
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby function cap (seconds)

const PAGE = 100;
const TIME_BUDGET_MS = 50_000; // stop before maxDuration so the response still returns
const TX_WAIT_MS = 20_000; // Arc has sub-second finality, so this rarely waits long

type RawStrategy = {
  owner: `0x${string}`;
  kind: number;
  recipient: `0x${string}`;
  tokenOut: `0x${string}`;
  amountPerPeriod: bigint;
  intervalSeconds: bigint;
  periodsTotal: number;
  periodsDone: number;
  nextRunAt: bigint;
  balance: bigint;
  status: number;
  createdAt: bigint;
};

async function runExecutor(): Promise<Record<string, unknown>> {
  const registry = env.strategyRegistryAddress;
  if (!registry) return { error: "Strategy registry not configured" };

  const startedAt = Date.now();
  const now = BigInt(Math.floor(Date.now() / 1000));

  const total = (await arcPublicClient.readContract({
    address: registry,
    abi: STRATEGY_REGISTRY_ABI,
    functionName: "totalStrategies",
  })) as bigint;

  let paid = 0;
  let swapped = 0;
  let skippedNoRoute = 0;
  let refunded = 0;
  let failed = 0;
  let timedOut = false;
  const errors: { id: string; error: string }[] = [];

  for (let offset = 0n; offset < total; offset += BigInt(PAGE)) {
    if (Date.now() - startedAt >= TIME_BUDGET_MS) { timedOut = true; break; }

    const ids = (await arcPublicClient.readContract({
      address: registry,
      abi: STRATEGY_REGISTRY_ABI,
      functionName: "allIds",
      args: [offset, BigInt(PAGE)],
    })) as readonly `0x${string}`[];

    const strategies = (await arcPublicClient.readContract({
      address: registry,
      abi: STRATEGY_REGISTRY_ABI,
      functionName: "getStrategiesBatch",
      args: [ids],
    })) as readonly RawStrategy[];

    for (let i = 0; i < ids.length; i++) {
      if (Date.now() - startedAt >= TIME_BUDGET_MS) { timedOut = true; break; }
      const s = strategies[i];

      // Due = active, scheduled time reached, and at least one period funded.
      if (s.status !== 0) continue;
      if (s.nextRunAt > now) continue;
      if (s.balance < s.amountPerPeriod) continue;

      if (s.kind === 1) {
        // Swap / DCA: quote the route FIRST (App Kit, else Synthra); only if it can route do we
        // release one period of USDC to the executor and swap it. executeSwap delivers tokenOut
        // straight to the owner (Synthra sends direct; App Kit forwards). releaseForSwap advances
        // the schedule atomically; if the swap fails, refund the released USDC to the owner.
        const token = tokenByAddress(s.tokenOut);
        const symbol = token?.symbol;
        if (!token?.address || (symbol !== "EURC" && symbol !== "cirBTC")) {
          failed++;
          errors.push({ id: ids[i], error: `unsupported tokenOut ${s.tokenOut}` });
          continue;
        }
        const amountInHuman = formatUnits(s.amountPerPeriod, 18);
        const route = await canSwap(symbol as SwapToken, amountInHuman, getExecutorAddress());
        if (!route.ok) {
          skippedNoRoute++;
          errors.push({ id: ids[i], error: `no swap route: ${route.error}` });
          continue;
        }

        let released = false;
        try {
          const rel = await dcwExecuteContract(registry, "releaseForSwap(bytes32)", [ids[i]]);
          const relId = (rel as { id?: string } | undefined)?.id;
          if (relId) {
            const state = await waitForTx(relId, TX_WAIT_MS);
            if (FAILED_STATES.has(state)) {
              failed++;
              errors.push({ id: ids[i], error: `release ${state}` });
              continue;
            }
          }
          released = true;

          await executeSwap(symbol as SwapToken, amountInHuman, getExecutorAddress(), s.owner);
          swapped++;
        } catch (err) {
          failed++;
          errors.push({ id: ids[i], error: err instanceof Error ? err.message : "swap failed" });
          // Swap didn't complete — refund the released USDC. (On mainnet a rare App Kit
          // swap-ok-but-forward-fail would leave the output in the executor; testnet uses the
          // atomic Synthra path, so a throw here means no swap happened.)
          if (released) {
            try {
              await refundUSDC(s.owner, s.amountPerPeriod);
              refunded++;
            } catch {
              /* refund best-effort; funds remain in the executor, recoverable */
            }
          }
        }
        continue;
      }

      // Payment: the contract forwards to the recipient. Fully trustless.
      try {
        const tx = await dcwExecuteContract(registry, "executePayment(bytes32)", [ids[i]]);
        const txId = (tx as { id?: string } | undefined)?.id;
        if (txId) {
          const state = await waitForTx(txId, TX_WAIT_MS);
          if (FAILED_STATES.has(state)) {
            failed++;
            errors.push({ id: ids[i], error: `tx ${state}` });
            continue;
          }
        }
        paid++;
      } catch (err) {
        failed++;
        errors.push({ id: ids[i], error: err instanceof Error ? err.message : "execute failed" });
      }
    }
    if (timedOut) break;
  }

  return {
    ok: true,
    paid,
    swapped,
    skippedNoRoute,
    refunded,
    failed,
    timedOut,
    tookMs: Date.now() - startedAt,
    ...(errors.length ? { errors } : {}),
  };
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Vercel Cron issues GET (and auto-attaches Authorization: Bearer CRON_SECRET).
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 400 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runExecutor());
  } catch (err) {
    console.error("[cron/execute-strategies]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Executor failed" },
      { status: 500 }
    );
  }
}

// Allow POST too, for external pingers that prefer it.
export const POST = GET;
