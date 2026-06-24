/**
 * Synthra DEX (Uniswap V3 fork) — the swap rail that works on Arc testnet.
 * SERVER-SIDE ONLY (executor-signed via DCW, no PIN).
 *
 * Circle App Kit's Stablecoin Service returns "No route available" for every Arc-testnet pair.
 * Synthra has real onchain liquidity so it is the de-facto swap rail on testnet.
 *
 * Encoding: viem encodeFunctionData + dcwExecuteRaw (raw calldata). Circle SDK's tuple
 * encoding via abiFunctionSignature/abiParameters is ambiguous for ExactInputSingleParams —
 * raw calldata removes all ambiguity.
 *
 * Gas note: on Arc, USDC is the native gas token. Because USDC native balance == ERC-20
 * precompile balance, every tx that pays gas (including the approve step) reduces the ERC-20
 * balance. synthraSwap reads the actual post-approve balance and swaps that rather than the
 * originally requested amount, so the exactInputSingle transferFrom never fails with "exceeds
 * balance".
 */
import { parseUnits, encodeFunctionData } from "viem";
import { arcPublicClient } from "@/shared/lib/arc";
import { dcwExecuteRaw, waitForTx } from "@/shared/lib/dcw";

const ROUTER = (process.env.SYNTHRA_ROUTER
  ?? process.env.NEXT_PUBLIC_SYNTHRA_ROUTER
  ?? "0x7fcEF1330B4C21f884D6894f3d6a56036E587aA9") as `0x${string}`;
const USDC_ERC20 = "0x3600000000000000000000000000000000000000";
const FEE = 3000;
const ZERO = "0x0000000000000000000000000000000000000000";
const FEE_MULTIPLIER = 0.997;
const FAILED = new Set(["FAILED", "CANCELLED", "DENIED"]);

type TokenRef = { address: `0x${string}`; decimals: number };

// ── ABIs ──────────────────────────────────────────────────────────────────────────────────────

const ROUTER_FACTORY_ABI = [
  { name: "factory", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
const FACTORY_ABI = [
  { name: "getPool", type: "function", stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }] },
] as const;
const SLOT0_ABI = [
  { name: "slot0", type: "function", stateMutability: "view", inputs: [], outputs: [
    { name: "sqrtPriceX96", type: "uint160" }, { name: "tick",          type: "int24"  },
    { name: "obsIdx",       type: "uint16"  }, { name: "obsCard",        type: "uint16" },
    { name: "obsCardNext",  type: "uint16"  }, { name: "feeProtocol",    type: "uint8"  },
    { name: "unlocked",     type: "bool"    },
  ] },
] as const;
const ERC20_ABI = [
  { name: "approve",   type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }] },
] as const;
// Synthra's router is a Uniswap SwapRouter02 (synthra-swap/swap-router-contract). Its
// IV3SwapRouter.ExactInputSingleParams has NO `deadline` field (deadline moved to multicall) —
// 7 fields, in this exact order. Including a deadline changes the function selector and the
// swap silently never executes.
const EXACT_INPUT_SINGLE_ABI = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [{
      name: "params", type: "tuple",
      components: [
        { name: "tokenIn",           type: "address" },
        { name: "tokenOut",          type: "address" },
        { name: "fee",               type: "uint24"  },
        { name: "recipient",         type: "address" },
        { name: "amountIn",          type: "uint256" },
        { name: "amountOutMinimum",  type: "uint256" },
        { name: "sqrtPriceLimitX96", type: "uint160" },
      ],
    }],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

// ── Pool helpers ──────────────────────────────────────────────────────────────────────────────

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

async function erc20Balance(token: `0x${string}`, owner: `0x${string}`): Promise<bigint> {
  return arcPublicClient.readContract({
    address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [owner],
  }) as Promise<bigint>;
}

// ── Amount helpers ────────────────────────────────────────────────────────────────────────────

function truncateToDecimals(amount: string, decimals: number): string {
  const [int, frac = ""] = amount.split(".");
  if (decimals === 0 || frac.length === 0) return int;
  return `${int}.${frac.slice(0, decimals)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────────────────────

/**
 * Spot-price estimate from the pool's slot0. ok:false = no pool on Synthra.
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

  const sqrt = Number(slot0[0]) / 2 ** 96;
  const priceRaw = sqrt * sqrt;
  const inIsToken0 = BigInt(tokenIn.address) < BigInt(tokenOut.address);
  const rate = (inIsToken0 ? priceRaw : 1 / priceRaw) * 10 ** (tokenIn.decimals - tokenOut.decimals);
  const out = Number(amountInHuman) * rate * FEE_MULTIPLIER;
  if (!isFinite(out) || out <= 0) return { ok: false };

  return { ok: true, estimatedOutput: out.toFixed(tokenOut.decimals), pool };
}

/**
 * Execute a swap on Synthra from the executor wallet. Output goes straight to `recipient`.
 *
 * `executor` is the DCW wallet that holds tokenIn and signs the txs. Passing it enables the
 * post-approve balance correction: on Arc, USDC is gas, so the approve tx reduces the ERC-20
 * balance. We read the actual post-approve balance and swap that (not the original requested
 * amount) to prevent exactInputSingle's transferFrom from failing with "exceeds balance".
 */
export async function synthraSwap(
  tokenIn: TokenRef,
  tokenOut: TokenRef,
  amountInHuman: string,
  recipient: `0x${string}`,
  executor?: `0x${string}`
): Promise<{ ok: boolean; state: string }> {
  const pool = await getPool(tokenIn.address, tokenOut.address);
  if (!pool) return { ok: false, state: "NO_POOL" };

  const safeAmount = truncateToDecimals(amountInHuman, tokenIn.decimals);
  const requestedAmountIn = parseUnits(safeAmount, tokenIn.decimals);
  if (requestedAmountIn === 0n) return { ok: false, state: "ZERO_AMOUNT" };

  // Step 1: approve the router to pull tokenIn. We set the full requested allowance so that
  // even after gas reduces the actual balance, the allowance is still sufficient.
  const approveCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [ROUTER, requestedAmountIn],
  });
  const approveRes = await dcwExecuteRaw(tokenIn.address, approveCalldata);
  const approveId = (approveRes as { id?: string } | undefined)?.id;
  if (!approveId) return { ok: false, state: "approve_no_id" };
  const approveSt = await waitForTx(approveId, 60_000);
  if (FAILED.has(approveSt)) return { ok: false, state: `approve_${approveSt}` };

  // Post-approve balance correction for USDC: USDC is Arc's native gas token, so paying gas
  // for the approve tx reduced the ERC-20 balance. Swap the actual balance rather than the
  // original requested amount — this prevents "transfer amount exceeds balance" in the router.
  let amountIn = requestedAmountIn;
  const isUSDC = tokenIn.address.toLowerCase() === USDC_ERC20.toLowerCase();
  if (executor && isUSDC) {
    const actual = await erc20Balance(tokenIn.address, executor);
    if (actual === 0n) return { ok: false, state: "ZERO_AFTER_GAS" };
    // The swap tx ALSO pays gas in USDC (USDC is Arc's native gas). Swapping the full
    // post-approve balance leaves nothing for that gas, so transferFrom reverts with
    // "exceeds balance". Hold back a buffer and swap the rest.
    const gasBuffer = parseUnits("0.02", tokenIn.decimals);
    const usable = actual > gasBuffer ? actual - gasBuffer : 0n;
    if (usable === 0n) return { ok: false, state: "ZERO_AFTER_GAS" };
    amountIn = usable < requestedAmountIn ? usable : requestedAmountIn;
  }

  // Step 2: exactInputSingle — output delivered directly to recipient. SwapRouter02 has no
  // deadline in the params struct (it lives on multicall, which we don't use here).
  const swapCalldata = encodeFunctionData({
    abi: EXACT_INPUT_SINGLE_ABI,
    functionName: "exactInputSingle",
    args: [{
      tokenIn:           tokenIn.address,
      tokenOut:          tokenOut.address,
      fee:               FEE,
      recipient,
      amountIn,
      amountOutMinimum:  0n,
      sqrtPriceLimitX96: 0n,
    }],
  });
  const swapRes = await dcwExecuteRaw(ROUTER, swapCalldata);
  const swapId = (swapRes as { id?: string } | undefined)?.id;
  if (!swapId) return { ok: false, state: "swap_no_id" };
  const swapSt = await waitForTx(swapId, 90_000);
  if (FAILED.has(swapSt)) return { ok: false, state: `swap_${swapSt}` };
  return { ok: true, state: swapSt };
}
