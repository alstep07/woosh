/**
 * Swap rail for the executor — SERVER-SIDE ONLY.
 *
 * Primary: Circle App Kit (the canonical path; works on mainnet where Circle has routes).
 * Fallback: a direct Synthra (Uniswap V3) call — on Arc TESTNET App Kit's Stablecoin Service
 * returns "No route available" for every pair, so Synthra is the de-facto path there.
 *
 * Both paths are executor-signed (DCW, no PIN). Output is always delivered to `recipient`:
 * App Kit swaps into the executor and we forward; Synthra sends straight to the recipient.
 */
import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { dcwTransfer } from "@/shared/lib/dcw";
import { synthraQuote, synthraSwap } from "@/shared/lib/synthra";
import { USDC_ERC20_ADDRESS, USDC_SWAP_DECIMALS, tokenBySymbol } from "@/shared/lib/tokens";

export type SwapToken = "EURC" | "cirBTC";
/** A swap pair always has USDC on one side. */
export type SwapSym = "USDC" | "EURC" | "cirBTC";

/**
 * Trim a decimal string to at most `decimals` places (no rounding). Circle's transfer API
 * rejects amounts carrying more decimals than the token supports ("API parameter invalid"),
 * so every human amount handed to dcwTransfer must pass through this first.
 */
export function clampDecimals(amount: string, decimals: number): string {
  const [int, frac = ""] = amount.split(".");
  if (decimals <= 0) return int;
  const trimmed = frac.slice(0, decimals);
  return trimmed ? `${int}.${trimmed}` : int;
}

function getKitKey(): string {
  const k = process.env.CIRCLE_KIT_KEY;
  if (!k) throw new Error("CIRCLE_KIT_KEY is not set (Circle Console kit key, required for swaps)");
  return k;
}

let _adapter: ReturnType<typeof createCircleWalletsAdapter> | null = null;
function getAdapter() {
  if (_adapter) return _adapter;
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey) throw new Error("CIRCLE_API_KEY is not set");
  if (!entitySecret) throw new Error("CIRCLE_ENTITY_SECRET is not set");
  _adapter = createCircleWalletsAdapter({ apiKey, entitySecret });
  return _adapter;
}

let _kit: AppKit | null = null;
function getKit(): AppKit {
  if (!_kit) _kit = new AppKit();
  return _kit;
}

function swapParams(tokenOut: SwapToken, amountInHuman: string, fromAddress: `0x${string}`) {
  return {
    from: { adapter: getAdapter(), chain: "Arc_Testnet" as const, address: fromAddress },
    tokenIn: "USDC" as const,
    tokenOut,
    amountIn: amountInHuman,
    config: { kitKey: getKitKey(), allowanceStrategy: "approve" as const },
  };
}

const USDC_REF = { address: USDC_ERC20_ADDRESS, decimals: USDC_SWAP_DECIMALS };
function refFor(sym: SwapSym): { address: `0x${string}`; decimals: number } {
  if (sym === "USDC") return USDC_REF;
  const t = tokenBySymbol(sym);
  if (!t?.address) throw new Error(`Token ${sym} is not configured`);
  return { address: t.address, decimals: t.decimals };
}

/** App Kit, in our config, only routes the forward USDC -> token path. Reverse uses Synthra. */
async function appKitEstimate(tokenOut: SwapToken, amountInHuman: string, fromAddress: `0x${string}`): Promise<string | null> {
  try {
    const est = await getKit().estimateSwap(swapParams(tokenOut, amountInHuman, fromAddress));
    return est.estimatedOutput?.amount ?? null;
  } catch {
    return null;
  }
}

export type SwapOutcome = {
  /** Human output amount delivered to the recipient (actual for App Kit, estimate for Synthra). */
  amountOut?: string;
  rail: "appkit" | "synthra";
};

/**
 * Quote a USDC<->token swap (either direction). Prefers App Kit on the forward path, otherwise
 * the Synthra spot estimate. Never throws.
 */
export async function quotePair(
  tokenIn: SwapSym,
  tokenOut: SwapSym,
  amountInHuman: string,
  fromAddress: `0x${string}`
): Promise<{ ok: boolean; estimatedOutput?: string; error?: string }> {
  if (tokenIn === "USDC" && tokenOut !== "USDC") {
    const ak = await appKitEstimate(tokenOut, amountInHuman, fromAddress);
    if (ak) return { ok: true, estimatedOutput: ak };
  }
  const syn = await synthraQuote(refFor(tokenIn), refFor(tokenOut), amountInHuman);
  return syn.ok ? { ok: true, estimatedOutput: syn.estimatedOutput } : { ok: false, error: "no route available" };
}

/** "Estimate before spend": does this pair route right now? Never throws. */
export async function canSwapPair(
  tokenIn: SwapSym,
  tokenOut: SwapSym,
  amountInHuman: string,
  fromAddress: `0x${string}`
): Promise<{ ok: boolean; error?: string }> {
  const q = await quotePair(tokenIn, tokenOut, amountInHuman, fromAddress);
  return { ok: q.ok, error: q.error };
}

/**
 * Execute a USDC<->token swap from the executor, delivering the output to `recipient`. Forward
 * (USDC -> token) tries App Kit first (output lands in the executor, then forwarded); otherwise,
 * and for the reverse direction, swaps directly on Synthra (output goes straight to recipient).
 * Throws if neither rail can complete (caller refunds the input).
 */
export async function executePair(
  tokenIn: SwapSym,
  tokenOut: SwapSym,
  amountInHuman: string,
  executor: `0x${string}`,
  recipient: `0x${string}`
): Promise<SwapOutcome> {
  if (tokenIn === "USDC" && tokenOut !== "USDC") {
    let appKitOut: string | undefined;
    try {
      const result = await getKit().swap(swapParams(tokenOut, amountInHuman, executor));
      appKitOut = (result as { amountOut?: string }).amountOut;
    } catch {
      appKitOut = undefined;
    }
    if (appKitOut) {
      // App Kit amountOut is already a human-readable decimal string (e.g. "0.999") — NOT base
      // units. Never call BigInt/formatUnits on it. Clamp to the token's decimals: Circle's
      // transfer API rejects amounts with more decimal places than the token supports.
      const t = refFor(tokenOut);
      const safeOut = clampDecimals(appKitOut, t.decimals);
      await dcwTransfer(recipient, safeOut, t.address);
      return { amountOut: safeOut, rail: "appkit" };
    }
  }

  const quote = await synthraQuote(refFor(tokenIn), refFor(tokenOut), amountInHuman);
  // Pass executor so synthraSwap can read the post-approve balance (gas on Arc is USDC,
  // so the approve tx reduces the ERC-20 balance before the swap runs).
  const res = await synthraSwap(refFor(tokenIn), refFor(tokenOut), amountInHuman, recipient, executor);
  if (!res.ok) throw new Error(`swap failed (${res.state})`);
  return { amountOut: quote.estimatedOutput, rail: "synthra" };
}

// ── USDC -> token wrappers (the DCA cron path) ───────────────────────────────────────────────
export async function canSwap(tokenOut: SwapToken, amountInHuman: string, fromAddress: `0x${string}`) {
  return canSwapPair("USDC", tokenOut, amountInHuman, fromAddress);
}
export async function quoteSwap(tokenOut: SwapToken, amountInHuman: string, fromAddress: `0x${string}`) {
  return quotePair("USDC", tokenOut, amountInHuman, fromAddress);
}
export async function executeSwap(
  tokenOut: SwapToken,
  amountInHuman: string,
  executor: `0x${string}`,
  recipient: `0x${string}`
): Promise<SwapOutcome> {
  return executePair("USDC", tokenOut, amountInHuman, executor, recipient);
}
