import { NextRequest, NextResponse } from "next/server";
import { arcPublicClient } from "@/shared/lib/arc";
import { STRATEGY_REGISTRY_ABI } from "@/entities/strategy/model/abi";
import { dcwExecuteContract, waitForTx } from "@/shared/lib/dcw";
import { env } from "@/shared/config/env";

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
  let skippedSwap = 0;
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
        // Swap / DCA: releaseForSwap hands funds to the executor to swap off-chain. We do
        // NOT release until the swap rail (StableFX/App Kit) is implemented and verified,
        // so funds are never released without a swap to complete. See Phase 7.
        skippedSwap++;
        continue;
      }

      // Payment: the contract forwards to the recipient. Fully trustless.
      try {
        const tx = await dcwExecuteContract(registry, "executePayment(bytes32)", [ids[i]]);
        const txId = (tx as { id?: string } | undefined)?.id;
        if (txId) {
          const state = await waitForTx(txId, TX_WAIT_MS);
          if (state === "FAILED" || state === "CANCELLED" || state === "DENIED") {
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
    skippedSwap,
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
