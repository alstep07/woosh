/**
 * Swap rail for the autonomous executor — SERVER-SIDE ONLY.
 *
 * Uses the LI.FI aggregator API, which is what actually routes swaps on Arc (the working
 * cirBTC swaps go through LiFiDiamond; Circle's hosted Stablecoin Service returned no route
 * for Arc Testnet pairs). LI.FI supports Arc Testnet (chain 5042002) directly. We quote a
 * route, then execute the returned transactionRequest from the DCW executor wallet (the same
 * wallet that triggers strategies, no raw key).
 *
 * Decimals: USDC is the native gas token (18-dec value) but its ERC-20 interface (0x3600…)
 * is 6 decimals — LI.FI uses the 6-dec representation, so swap amounts come in as 6-dec base
 * units. cirBTC is 8-dec, EURC 6-dec; LI.FI returns the output in the target token's decimals.
 */
import { formatUnits } from "viem";
import { dcwExecuteContract, dcwExecuteRaw } from "@/shared/lib/dcw";
import { USDC_ERC20_ADDRESS } from "@/shared/lib/tokens";

const LIFI_BASE = "https://li.quest/v1";
const ARC_TESTNET_CHAIN = 5042002;
const DEFAULT_SLIPPAGE = 0.05; // 5% — testnet liquidity is thin

type LifiQuote = {
  estimate?: { toAmount?: string; approvalAddress?: string };
  action?: { toToken?: { decimals?: number; symbol?: string } };
  transactionRequest?: { to?: string; data?: string; value?: string };
  message?: string;
  code?: number;
};

/** Fetch a LI.FI quote for USDC -> tokenOut on Arc. amountIn6 = USDC base units (6-dec). */
async function lifiQuote(
  tokenOutAddress: string,
  amountIn6: string,
  fromAddress: string
): Promise<LifiQuote> {
  const url =
    `${LIFI_BASE}/quote?fromChain=${ARC_TESTNET_CHAIN}&toChain=${ARC_TESTNET_CHAIN}` +
    `&fromToken=${USDC_ERC20_ADDRESS}&toToken=${tokenOutAddress}` +
    `&fromAmount=${amountIn6}&fromAddress=${fromAddress}` +
    `&slippage=${DEFAULT_SLIPPAGE}&integrator=woosh`;
  const headers: Record<string, string> = {};
  if (process.env.LIFI_API_KEY) headers["x-lifi-api-key"] = process.env.LIFI_API_KEY;
  const res = await fetch(url, { headers, cache: "no-store" });
  return (await res.json()) as LifiQuote;
}

/** Convert a native 18-dec USDC amount (the contract's unit) to 6-dec swap base units. */
export function usdc18ToSwap6(amount18: bigint): string {
  return (amount18 / 10n ** 12n).toString();
}

export type SwapOutcome = {
  amountInUsdc6: string;
  amountOut?: string;       // base units in tokenOut decimals
  tokenOutDecimals?: number;
};

/**
 * Does a route exist + quote successfully right now? Mirrors the Unified Balance Kit
 * "estimate before spend" rule: the executor must not release a period of USDC to itself
 * unless the swap can actually be built. Never throws.
 */
export async function canSwap(
  tokenOutAddress: string,
  amountIn6: string,
  fromAddress: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const q = await lifiQuote(tokenOutAddress, amountIn6, fromAddress);
    if (q.transactionRequest?.to && q.transactionRequest.data) return { ok: true };
    return { ok: false, error: q.message ?? "no route" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "quote failed" };
  }
}

/**
 * Swap `amountIn6` USDC (6-dec base units) into the token at `tokenOutAddress` from the
 * executor wallet. Approves the LI.FI router for the ERC-20 USDC first when required, sends
 * native value when LI.FI routes native. Output lands in the executor; the caller forwards it.
 */
export async function swapUsdcTo(
  tokenOutAddress: string,
  amountIn6: string,
  fromAddress: string
): Promise<SwapOutcome> {
  const q = await lifiQuote(tokenOutAddress, amountIn6, fromAddress);
  const tx = q.transactionRequest;
  if (!tx?.to || !tx.data) {
    throw new Error(`LI.FI no route: ${q.message ?? "unknown"}`);
  }

  // ERC-20 path: approve the router to pull USDC (0x3600) before swapping.
  if (q.estimate?.approvalAddress) {
    await dcwExecuteContract(
      USDC_ERC20_ADDRESS,
      "approve(address,uint256)",
      [q.estimate.approvalAddress, amountIn6]
    );
  }

  // Native value (Arc USDC is the gas token) comes back as 18-dec wei; "0" for ERC-20 routes.
  const nativeValue = tx.value && BigInt(tx.value) > 0n ? formatUnits(BigInt(tx.value), 18) : undefined;
  await dcwExecuteRaw(tx.to, tx.data, nativeValue);

  return {
    amountInUsdc6: amountIn6,
    amountOut: q.estimate?.toAmount,
    tokenOutDecimals: q.action?.toToken?.decimals,
  };
}
