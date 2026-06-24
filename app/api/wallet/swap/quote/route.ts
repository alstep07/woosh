import { NextRequest, NextResponse } from "next/server";
import { synrouteQuote } from "@/shared/lib/synroute";
import { USDC_ERC20_ADDRESS, USDC_SWAP_DECIMALS, tokenBySymbol } from "@/shared/lib/tokens";
import type { SwapSym } from "@/shared/lib/swap";

// Exactly one side of a swap must be USDC; the other must be a configured swap token.
const TOKENS = new Set(["USDC", "EURC", "cirBTC"]);
function validPair(tokenIn?: string, tokenOut?: string): boolean {
  if (!tokenIn || !tokenOut || tokenIn === tokenOut) return false;
  if (!TOKENS.has(tokenIn) || !TOKENS.has(tokenOut)) return false;
  return tokenIn === "USDC" || tokenOut === "USDC";
}

const USDC_REF = { address: USDC_ERC20_ADDRESS as `0x${string}`, decimals: USDC_SWAP_DECIMALS };
function refFor(sym: string) {
  if (sym === "USDC") return USDC_REF;
  const t = tokenBySymbol(sym as SwapSym);
  if (!t?.address) throw new Error(`Token ${sym} not configured`);
  return { address: t.address as `0x${string}`, decimals: t.decimals };
}

// Quote a swap via SynRoute API directly — bypassing App Kit which has no routes on Arc
// testnet and hangs for 40+ seconds before failing. SynRoute has a 25s abort timeout.
export async function POST(req: NextRequest) {
  try {
    const { tokenIn, tokenOut, amount } = await req.json();
    if (!validPair(tokenIn, tokenOut)) {
      return NextResponse.json({ error: "Unsupported pair" }, { status: 400 });
    }
    if (!/^\d+(\.\d+)?$/.test(String(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const res = await synrouteQuote(refFor(tokenIn), refFor(tokenOut), String(amount));
    if (!res.ok) return NextResponse.json({ ok: false, error: "No route available" });
    return NextResponse.json({ ok: true, estimatedOutput: res.estimatedOutput });
  } catch (err) {
    console.error("[swap/quote]", err);
    return NextResponse.json({ error: "Quote unavailable" }, { status: 500 });
  }
}
