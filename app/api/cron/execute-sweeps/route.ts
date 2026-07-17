import { NextRequest, NextResponse } from "next/server";
import { getAbiItem } from "viem";
import { arcPublicClient } from "@/shared/lib/arc";
import { SAVINGS_VAULT_ABI } from "@/entities/savings/model/abi";
import { dcwExecuteContract, waitForTx } from "@/shared/lib/dcw";
import { env } from "@/shared/config/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby function cap (seconds)

// WooshSavingsVault has no owner-enumeration function (by design, it only tracks
// balances/rules per-owner), so "who has an auto-sweep rule" is discovered by scanning
// SweepRuleSet events from deployment rather than a stored index (no off-chain DB, per
// project convention). eth_getLogs on this RPC caps a single call at a 10,000-block
// range, so the scan is paginated. At today's ~470k-block range that's a few dozen
// mostly-empty, fast calls, comfortably inside the time budget below; if this contract's
// history grows into the millions of blocks, a persisted "last scanned block" cursor
// would be needed instead of a full rescan every run.
const VAULT_DEPLOY_BLOCK = 51_931_741n;
const LOG_CHUNK = 10_000n;
const TIME_BUDGET_MS = 45_000; // stop before maxDuration so the response still returns
const TX_WAIT_MS = 20_000; // Arc has sub-second finality, so this rarely waits long
const DUST_FLOOR_6DEC = 10_000n; // 0.01 USDC, not worth a transaction below this

const FAILED_STATES = new Set(["FAILED", "CANCELLED", "DENIED"]);

type SweepRule = {
  threshold: bigint;
  capPerRun: bigint;
  intervalSeconds: bigint;
  nextRunAt: bigint;
  enabled: boolean;
};

/** Every address that has ever called setSweepRule, from onchain events. Some may have
 *  since disabled their rule; callers re-check getSweepRule before acting on any of
 *  these, this is only a candidate list. */
async function findSweepCandidates(vault: `0x${string}`, startedAt: number): Promise<`0x${string}`[]> {
  const owners = new Set<`0x${string}`>();
  const latest = await arcPublicClient.getBlockNumber();
  const event = getAbiItem({ abi: SAVINGS_VAULT_ABI, name: "SweepRuleSet" });

  for (let from = VAULT_DEPLOY_BLOCK; from <= latest; from += LOG_CHUNK) {
    if (Date.now() - startedAt >= TIME_BUDGET_MS) break;
    const to = from + LOG_CHUNK - 1n > latest ? latest : from + LOG_CHUNK - 1n;
    const logs = await arcPublicClient.getLogs({ address: vault, event, fromBlock: from, toBlock: to });
    for (const log of logs) {
      const owner = (log.args as { owner?: `0x${string}` }).owner;
      if (owner) owners.add(owner);
    }
  }
  return [...owners];
}

async function runSweeps(): Promise<Record<string, unknown>> {
  const vault = env.savingsVaultAddress;
  if (!vault) return { error: "Savings vault not configured" };

  const startedAt = Date.now();
  const now = BigInt(Math.floor(Date.now() / 1000));

  const candidates = await findSweepCandidates(vault, startedAt);

  let swept = 0;
  let skippedNotDue = 0;
  let skippedDisabled = 0;
  let skippedDust = 0;
  let failed = 0;
  let timedOut = false;
  const errors: { owner: string; error: string }[] = [];

  for (const owner of candidates) {
    if (Date.now() - startedAt >= TIME_BUDGET_MS) { timedOut = true; break; }

    const rule = (await arcPublicClient.readContract({
      address: vault,
      abi: SAVINGS_VAULT_ABI,
      functionName: "getSweepRule",
      args: [owner],
    })) as SweepRule;

    if (!rule.enabled) { skippedDisabled++; continue; }
    if (rule.nextRunAt > now) { skippedNotDue++; continue; }

    const ownerBal = await arcPublicClient.getBalance({ address: owner });
    if (ownerBal <= rule.threshold) { skippedDust++; continue; }

    // Pull the lesser of "excess above the floor" and the owner's own per-run cap.
    // The USDC precompile takes the amount in 6-dec units; sweepFrom converts back to
    // 18-dec native internally (same scaling as refundUSDC/runPortfolio's pull math in
    // /api/cron/execute-strategies).
    const excess18 = ownerBal - rule.threshold;
    const pull18 = excess18 < rule.capPerRun ? excess18 : rule.capPerRun;
    const pull6 = pull18 / 1_000_000_000_000n;
    if (pull6 < DUST_FLOOR_6DEC) { skippedDust++; continue; }

    try {
      const tx = await dcwExecuteContract(vault, "sweepFrom(address,uint256)", [owner, pull6.toString()]);
      const txId = (tx as { id?: string } | undefined)?.id;
      if (txId) {
        const state = await waitForTx(txId, TX_WAIT_MS);
        if (FAILED_STATES.has(state)) {
          failed++;
          errors.push({ owner, error: `sweep ${state}` });
          continue;
        }
      }
      swept++;
    } catch (err) {
      failed++;
      errors.push({ owner, error: err instanceof Error ? err.message : "sweep failed" });
    }
  }

  return {
    ok: true,
    candidates: candidates.length,
    swept,
    skippedNotDue,
    skippedDisabled,
    skippedDust,
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
    return NextResponse.json(await runSweeps());
  } catch (err) {
    console.error("[cron/execute-sweeps]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sweep executor failed" },
      { status: 500 }
    );
  }
}

// Allow POST too, for external pingers that prefer it.
export const POST = GET;
