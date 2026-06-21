/**
 * Swap rail for the autonomous executor — SERVER-SIDE ONLY.
 *
 * Uses Circle's Swap Kit with the Circle Wallets adapter, so the SAME developer-controlled
 * (DCW) executor wallet that triggers strategies also signs the swap, no raw private key and
 * no separate signer. This is the proper Circle path (docs.arc.io/app-kit/swap): the
 * developer-controlled adapter is built from the API key + entity secret, and the wallet
 * address is supplied per operation.
 *
 * Arc Testnet supports USDC, EURC and cirBTC swaps. The kit key (free, Circle Console) is
 * passed inline per swap via config.kitKey.
 */
import { SwapKit } from "@circle-fin/swap-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

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

let _kit: SwapKit | null = null;
function getKit(): SwapKit {
  if (!_kit) _kit = new SwapKit();
  return _kit;
}

export type SwapOutcome = {
  amountIn: string;
  amountOut?: string;
  tokenOut: string;
};

/**
 * Check a route exists + is quotable BEFORE committing funds. Mirrors the Unified Balance
 * Kit "estimate before spend" rule: the executor must NOT release a period of USDC to itself
 * if the swap can't actually happen (e.g. no USDC->cirBTC route), otherwise the vault drains
 * to the executor with nothing delivered. Returns ok:false (never throws) on any route error.
 */
export async function canSwap(
  tokenOutSymbol: "EURC" | "cirBTC",
  amountIn: string,
  executorAddress: `0x${string}`
): Promise<{ ok: boolean; error?: string }> {
  try {
    await getKit().estimate({
      from: { adapter: getAdapter(), chain: "Arc_Testnet", address: executorAddress },
      tokenIn: "USDC",
      tokenOut: tokenOutSymbol,
      amountIn,
      config: { kitKey: getKitKey() },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "no route" };
  }
}

/**
 * Swap `amountIn` USDC into `tokenOutSymbol` ("EURC" | "cirBTC") from the executor wallet.
 * The output lands in the executor wallet; the caller forwards it to the strategy owner.
 */
export async function swapUsdcTo(
  tokenOutSymbol: "EURC" | "cirBTC",
  amountIn: string,
  executorAddress: `0x${string}`
): Promise<SwapOutcome> {
  const result = await getKit().swap({
    from: { adapter: getAdapter(), chain: "Arc_Testnet", address: executorAddress },
    tokenIn: "USDC",
    tokenOut: tokenOutSymbol,
    amountIn,
    config: { kitKey: getKitKey() },
  });
  return { amountIn: result.amountIn, amountOut: result.amountOut, tokenOut: result.tokenOut };
}
