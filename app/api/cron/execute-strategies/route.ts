import { NextRequest, NextResponse } from "next/server";
import { formatUnits, encodeFunctionData } from "viem";
import { arcPublicClient } from "@/shared/lib/arc";
import { STRATEGY_REGISTRY_ABI } from "@/entities/strategy/model/abi";
import { dcwExecuteContract, dcwExecuteRaw, waitForTx, getExecutorAddress } from "@/shared/lib/dcw";
import { executeSwap, canSwap, type SwapToken } from "@/shared/lib/swap";
import { tokenByAddress } from "@/shared/lib/tokens";
import { splitDepositPeriod, splitProportional, sweepPullAmount, swapLegs } from "@/entities/strategy/lib/allocation";
import type { PortfolioLeg } from "@/entities/strategy/model/types";
import { env } from "@/shared/config/env";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const ERC20_TRANSFER_ABI = [{
  name: "transfer",
  type: "function",
  stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ type: "bool" }],
}] as const;

// The USDC precompile's ERC-20 interface uses 6 decimals over the same balance the
// 18-decimal native side sees, so the released native amount must be scaled down by
// 1e12 before an ERC-20 transfer (same conversion as /api/wallet/swap/execute).
async function refundUSDC(to: `0x${string}`, amountPerPeriod: bigint): Promise<boolean> {
  const erc20Amount = amountPerPeriod / 1_000_000_000_000n;
  if (erc20Amount === 0n) return false;
  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [to, erc20Amount],
  });
  const r = await dcwExecuteRaw(USDC_ADDRESS, data);
  const id = (r as { id?: string } | undefined)?.id;
  if (!id) return false;
  const state = await waitForTx(id, 30_000);
  return state === "COMPLETE" || state === "CONFIRMED";
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

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

type PortfolioRunResult = {
  swapped?: number;
  refunded?: number;
  skippedNoRoute?: boolean;
  failed?: boolean;
  error?: string;
};

/**
 * Execute one due Portfolio strategy. Deposit mode: releaseForPortfolio moves the USDC
 * leg straight to the owner on-chain and hands the executor only the swap share. Sweep
 * mode: sweepForPortfolio pulls the swap share of the owner's excess (threshold + cap
 * enforced by the contract). Either way the executor then swaps each leg and delivers
 * output to the owner; a failed leg refunds EXACTLY that leg's USDC — never a balance
 * scan — so concurrent strategies can't cross-contaminate.
 */
async function runPortfolio(
  registry: `0x${string}`,
  id: `0x${string}`,
  s: RawStrategy
): Promise<PortfolioRunResult> {
  let legs: PortfolioLeg[];
  let mode: number;
  let threshold: bigint;
  try {
    const [tokens, bps, m, thr] = (await arcPublicClient.readContract({
      address: registry,
      abi: STRATEGY_REGISTRY_ABI,
      functionName: "getPortfolio",
      args: [id],
    })) as [readonly `0x${string}`[], readonly number[], number, bigint];
    legs = tokens.map((t, i) => ({
      token: t.toLowerCase() === ZERO_ADDR ? null : t,
      bps: Number(bps[i]),
    }));
    mode = Number(m);
    threshold = thr;
  } catch {
    return { failed: true, error: "portfolio config read failed" };
  }

  const targets = swapLegs(legs);
  for (const l of targets) {
    const t = tokenByAddress(l.token!);
    if (!t?.address || (t.symbol !== "EURC" && t.symbol !== "cirBTC")) {
      return { failed: true, error: `unsupported leg token ${l.token}` };
    }
  }

  // Per-leg USDC amounts (18-dec native units, exact bigint math).
  let legAmounts: { leg: PortfolioLeg; amount: bigint }[];
  if (mode === 0) {
    if (s.balance < s.amountPerPeriod) return {}; // underfunded — same silent skip as other kinds
    legAmounts = splitDepositPeriod(s.amountPerPeriod, legs).legAmounts;
  } else {
    const ownerBal = await arcPublicClient.getBalance({ address: s.owner });
    const { amount6, amount18 } = sweepPullAmount(ownerBal - threshold, s.amountPerPeriod, legs);
    if (amount6 < 10_000n) return {}; // under 0.01 USDC above threshold — nothing to do
    const amounts = splitProportional(amount18, targets.map((l) => l.bps));
    legAmounts = targets.map((leg, i) => ({ leg, amount: amounts[i] }));
  }
  legAmounts = legAmounts.filter((la) => la.amount > 0n);
  if (legAmounts.length === 0) return {};

  // Quote every leg FIRST — all-or-skip, nothing moves unless each leg can route.
  for (const { leg, amount } of legAmounts) {
    const sym = tokenByAddress(leg.token!)!.symbol as SwapToken;
    const route = await canSwap(sym, formatUnits(amount, 18), getExecutorAddress());
    if (!route.ok) return { skippedNoRoute: true, error: `no route for ${sym}: ${route.error}` };
  }

  // Move the funds (release from budget, or pull from the owner's wallet).
  const pulled6 = legAmounts.reduce((a, la) => a + la.amount, 0n) / 1_000_000_000_000n;
  try {
    const tx =
      mode === 0
        ? await dcwExecuteContract(registry, "releaseForPortfolio(bytes32)", [id])
        : await dcwExecuteContract(registry, "sweepForPortfolio(bytes32,uint256)", [id, pulled6.toString()]);
    const txId = (tx as { id?: string } | undefined)?.id;
    if (txId) {
      const state = await waitForTx(txId, TX_WAIT_MS);
      if (FAILED_STATES.has(state)) {
        return { failed: true, error: `${mode === 0 ? "release" : "sweep"} ${state}` };
      }
    }
  } catch (err) {
    return {
      failed: true,
      error: err instanceof Error ? err.message : "portfolio release failed",
    };
  }

  // Swap each leg; output goes straight to the owner. Refund failed legs exactly.
  let swapped = 0;
  let refunded = 0;
  const legErrors: string[] = [];
  for (const { leg, amount } of legAmounts) {
    const sym = tokenByAddress(leg.token!)!.symbol as SwapToken;
    try {
      await executeSwap(sym, formatUnits(amount, 18), getExecutorAddress(), s.owner);
      swapped++;
    } catch (err) {
      legErrors.push(`${sym} leg: ${err instanceof Error ? err.message : "swap failed"}`);
      try {
        if (await refundUSDC(s.owner, amount)) {
          refunded++;
        } else {
          legErrors.push(`${sym} leg refund not confirmed, funds in executor`);
        }
      } catch {
        legErrors.push(`${sym} leg refund failed, funds in executor`);
      }
    }
  }

  return {
    swapped,
    refunded,
    ...(legErrors.length ? { failed: true, error: legErrors.join("; ") } : {}),
  };
}

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

      // Due = active and scheduled time reached. The balance requirement only applies
      // to custodied kinds — sweep portfolios hold no balance by design (kind 2 checks
      // its own funding inside the handler once the mode is known).
      if (s.status !== 0) continue;
      if (s.nextRunAt > now) continue;
      if (s.kind !== 2 && s.balance < s.amountPerPeriod) continue;

      if (s.kind === 2) {
        // Portfolio: allocate one period across weighted legs. Deposit mode releases from
        // the custodied budget (USDC leg goes straight to the owner on-chain); sweep mode
        // pulls the owner's wallet excess above the threshold (USDC leg just stays put).
        const out = await runPortfolio(registry, ids[i], s);
        if (out.swapped) swapped += out.swapped;
        if (out.refunded) refunded += out.refunded;
        if (out.skippedNoRoute) skippedNoRoute++;
        if (out.failed) failed++;
        if (out.error) errors.push({ id: ids[i], error: out.error });
        continue;
      }

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
              if (await refundUSDC(s.owner, s.amountPerPeriod)) {
                refunded++;
              } else {
                console.error(`[cron] refund tx did not confirm for strategy ${ids[i]}, funds remain in the executor`);
                errors.push({ id: ids[i], error: "refund not confirmed, funds in executor" });
              }
            } catch (refundErr) {
              console.error(`[cron] refund failed for strategy ${ids[i]}`, refundErr);
              errors.push({ id: ids[i], error: "refund failed, funds in executor" });
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
