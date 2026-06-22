/**
 * Synthra DEX (Uniswap V3 fork) — the swap rail that actually works on Arc testnet.
 * SERVER-SIDE ONLY (executor-signed via DCW, no PIN).
 *
 * Circle App Kit routes Arc swaps through the hosted Stablecoin Service, which returns
 * "No route available" for every Arc-testnet pair (confirmed live). Synthra has real
 * onchain liquidity, so we use it as the fallback (and, on testnet, the de-facto path).
 *
 * Pools (fee 3000) confirmed live: USDC/cirBTC and USDC/EURC. USDC's ERC-20 precompile
 * (0x3600…, the lowest address) is token0 in both, which the math below relies on by
 * comparing addresses rather than assuming an order.
 */
import { parseUnits } from "viem";
import { arcPublicClient } from "@/shared/lib/arc";
import { dcwExecuteContract, waitForTx } from "@/shared/lib/dcw";

const ROUTER = (process.env.SYNTHRA_ROUTER
  ?? process.env.NEXT_PUBLIC_SYNTHRA_ROUTER
  ?? "0x7fcEF1330B4C21f884D6894f3d6a56036E587aA9") as `0x${string}`;
const FEE = 3000;
const ZERO = "0x0000000000000000000000000000000000000000";
const FEE_MULTIPLIER = 0.997; // 0.3% pool fee, for the display estimate
const FAILED = new Set(["FAILED", "CANCELLED", "DENIED"]);

type TokenRef = { address: `0x${string}`; decimals: number };

const ROUTER_FACTORY_ABI = [
  { name: "factory", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
const FACTORY_ABI = [
  { name: "getPool", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }], outputs: [{ type: "address" }] },
] as const;
const SLOT0_ABI = [
  { name: "slot0", type: "function", stateMutability: "view", inputs: [], outputs: [
    { name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" }, { name: "obsIdx", type: "uint16" },
    { name: "obsCard", type: "uint16" }, { name: "obsCardNext", type: "uint16" }, { name: "feeProtocol", type: "uint8" }, { name: "unlocked", type: "bool" },
  ] },
] as const;

let _factory: `0x${string}` | null = null;
async function getFactory(): Promise<`0x${string}`> {
  if (_factory) return _factory;
  _factory = (await arcPublicClient.readContract({
    address: ROUTER, abi: ROUTER_FACTORY_ABI, functionName: "factory",
  })) as `0x${string}`;
  return _factory;
}

const poolCache = new Map<string, `0x${string}` | null>();
async function getPool(a: `0x${string}`, b: `0x${string}`): Promise<`0x${string}` | null> {
  const key = [a.toLowerCase(), b.toLowerCase()].sort().join("-");
  if (poolCache.has(key)) return poolCache.get(key)!;
  const factory = await getFactory();
  const pool = (await arcPublicClient.readContract({
    address: factory, abi: FACTORY_ABI, functionName: "getPool", args: [a, b, FEE],
  })) as `0x${string}`;
  const result = !pool || pool === ZERO ? null : pool;
  poolCache.set(key, result);
  return result;
}

/**
 * Spot-price estimate from the pool's slot0 (both directions). Returns the human output and
 * the pool address. ok:false means no pool — Synthra can't route this pair either.
 */
export async function synthraQuote(
  tokenIn: TokenRef,
  tokenOut: TokenRef,
  amountInHuman: string
): Promise<{ ok: boolean; estimatedOutput?: string; pool?: `0x${string}` }> {
  const pool = await getPool(tokenIn.address, tokenOut.address);
  if (!pool) return { ok: false };

  const slot0 = (await arcPublicClient.readContract({
    address: pool, abi: SLOT0_ABI, functionName: "slot0",
  })) as readonly [bigint, number, number, number, number, number, boolean];

  // priceRaw = token1_raw per token0_raw, where token0 = the lower address.
  const sqrt = Number(slot0[0]) / 2 ** 96;
  const priceRaw = sqrt * sqrt;
  const inIsToken0 = BigInt(tokenIn.address) < BigInt(tokenOut.address);
  const rate = (inIsToken0 ? priceRaw : 1 / priceRaw) * 10 ** (tokenIn.decimals - tokenOut.decimals);
  const out = Number(amountInHuman) * rate * FEE_MULTIPLIER;
  if (!isFinite(out) || out <= 0) return { ok: false };

  // Trim to the output token's precision so we never present more digits than exist.
  return { ok: true, estimatedOutput: out.toFixed(tokenOut.decimals), pool };
}

/**
 * Execute a swap directly on Synthra from the executor wallet: approve the router, then
 * exactInputSingle with the output going straight to `recipient` (no forward step). On
 * testnet we set amountOutMinimum = 0 to guarantee execution on thin pools; mainnet uses
 * App Kit (with slippage protection) as the primary rail.
 */
export async function synthraSwap(
  tokenIn: TokenRef,
  tokenOut: TokenRef,
  amountInHuman: string,
  recipient: `0x${string}`
): Promise<{ ok: boolean; state: string }> {
  const pool = await getPool(tokenIn.address, tokenOut.address);
  if (!pool) return { ok: false, state: "NO_POOL" };

  const amountIn = parseUnits(amountInHuman, tokenIn.decimals).toString();

  // Uniswap V3 pulls tokenIn via transferFrom, so approve the router for exactly this amount.
  const approve = await dcwExecuteContract(tokenIn.address, "approve(address,uint256)", [ROUTER, amountIn]);
  const approveId = (approve as { id?: string } | undefined)?.id;
  if (approveId) {
    const st = await waitForTx(approveId, 20_000);
    if (FAILED.has(st)) return { ok: false, state: `approve ${st}` };
  }

  const deadline = String(Math.floor(Date.now() / 1000) + 600);
  const params = [tokenIn.address, tokenOut.address, String(FEE), recipient, deadline, amountIn, "0", "0"];
  const swap = await dcwExecuteContract(
    ROUTER,
    "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))",
    [params],
  );
  const swapId = (swap as { id?: string } | undefined)?.id;
  if (swapId) {
    const st = await waitForTx(swapId, 25_000);
    if (FAILED.has(st)) return { ok: false, state: `swap ${st}` };
  }
  return { ok: true, state: "COMPLETE" };
}
