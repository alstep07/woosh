import { NextRequest, NextResponse } from "next/server";
import { provisionExecutorWallet } from "@/shared/lib/dcw";

/**
 * One-time setup: create the DCW executor wallet (wallet set + one EOA on Arc).
 * Protected by CRON_SECRET. After calling this:
 *   1. Put walletId in EXECUTOR_WALLET_ID and address in EXECUTOR_ADDRESS.
 *   2. Call WooshStrategyRegistry.setExecutor(address) from the admin key.
 *   3. Fund the address with USDC (USDC is gas on Arc).
 *
 * Idempotency note: this creates a NEW wallet every call. Run once, then stop using it.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 400 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await provisionExecutorWallet();
    return NextResponse.json({
      ...result,
      next: [
        "Set EXECUTOR_WALLET_ID and EXECUTOR_ADDRESS in your environment.",
        "Call WooshStrategyRegistry.setExecutor(EXECUTOR_ADDRESS) from the admin key.",
        "Fund EXECUTOR_ADDRESS with USDC (USDC is gas on Arc).",
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to provision executor";
    console.error("[provision-executor]", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
