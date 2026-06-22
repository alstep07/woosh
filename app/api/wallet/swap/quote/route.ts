import { NextRequest, NextResponse } from "next/server";
import { quotePair, type SwapSym } from "@/shared/lib/swap";
import { getExecutorAddress } from "@/shared/lib/dcw";

// Exactly one side of a swap must be USDC; the other must be a configured swap token.
const TOKENS = new Set(["USDC", "EURC", "cirBTC"]);
function validPair(tokenIn?: string, tokenOut?: string): boolean {
  if (!tokenIn || !tokenOut || tokenIn === tokenOut) return false;
  if (!TOKENS.has(tokenIn) || !TOKENS.has(tokenOut)) return false;
  return tokenIn === "USDC" || tokenOut === "USDC";
}

// Preview a USDC<->token swap before the user commits. No auth: it's just an estimate.
export async function POST(req: NextRequest) {
  try {
    const { tokenIn, tokenOut, amount } = await req.json();
    if (!validPair(tokenIn, tokenOut)) {
      return NextResponse.json({ error: "Unsupported pair" }, { status: 400 });
    }
    if (!/^\d+(\.\d+)?$/.test(String(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const res = await quotePair(tokenIn as SwapSym, tokenOut as SwapSym, String(amount), getExecutorAddress());
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error ?? "No route" });
    return NextResponse.json({ ok: true, estimatedOutput: res.estimatedOutput });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Quote failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
