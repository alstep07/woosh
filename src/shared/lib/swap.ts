/**
 * Swap rail for the autonomous executor — SERVER-SIDE ONLY.
 *
 * Uses Circle's App Kit (the canonical path per docs.arc.io/app-kit/swap), which on Arc
 * routes through LI.FI under the hood — the same path the working onchain cirBTC swaps take
 * (App Kit Adapter -> LiFiDiamond). The Circle Wallets adapter lets the DCW executor sign the
 * swap, no raw key. App Kit handles token decimals internally, so amounts are human strings
 * (e.g. "1.00"); we pass the per-period USDC amount as a decimal string.
 *
 * NOTE the bare `@circle-fin/swap-kit` (`new SwapKit()`) only loads the StablecoinService
 * provider (stablecoins only) and cannot route cirBTC. `AppKit` includes the LI.FI provider,
 * which is why it must be used here.
 *
 * Requires a valid CIRCLE_KIT_KEY (Circle Console). SCA wallets need allowanceStrategy:"approve".
 */
import { AppKit } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

export type SwapToken = "EURC" | "cirBTC";

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

export type SwapOutcome = {
  amountOut?: string; // base units in tokenOut decimals
};

/**
 * Can this swap be quoted right now? "Estimate before spend": the executor must not release a
 * period of USDC unless the swap actually routes. Never throws.
 */
export async function canSwap(
  tokenOut: SwapToken,
  amountInHuman: string,
  fromAddress: `0x${string}`
): Promise<{ ok: boolean; error?: string }> {
  try {
    await getKit().estimateSwap(swapParams(tokenOut, amountInHuman, fromAddress));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "estimate failed" };
  }
}

/**
 * Execute the swap from the executor wallet via App Kit (adapter signs, no PIN). Output lands
 * in the executor; the caller forwards it to the strategy owner. Returns the output base units.
 */
export async function executeSwap(
  tokenOut: SwapToken,
  amountInHuman: string,
  fromAddress: `0x${string}`
): Promise<SwapOutcome> {
  const result = await getKit().swap(swapParams(tokenOut, amountInHuman, fromAddress));
  return { amountOut: (result as { amountOut?: string }).amountOut };
}
