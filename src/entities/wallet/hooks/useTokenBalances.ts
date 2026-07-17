"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { arcPublicClient } from "@/shared/lib/arc";
import { USDC, EURC, CIRBTC, type SupportedToken } from "@/shared/lib/tokens";

export type TokenHolding = {
  symbol: string;
  amount: string;        // human decimal
  usd: number | null;    // USDC-equivalent estimate, null if no price
};

export type Holdings = {
  tokens: TokenHolding[];
  totalUsd: number;
  hasPrices: boolean;
};

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Throws on RPC failure rather than returning 0n — a failed read must never be
 *  mistaken for a real zero balance (that previously made whichever token's read
 *  happened to fail on a given poll silently vanish from the list). */
async function readErc20(token: SupportedToken, account: `0x${string}`): Promise<bigint> {
  if (!token.address) return 0n;
  return (await arcPublicClient.readContract({
    address: token.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account],
  })) as bigint;
}

/**
 * USD prices for the USDC-equivalent total. USDC is 1:1; cirBTC tracks BTC and EURC tracks
 * EUR. Fetched via our own /api/prices proxy (server-side CoinGecko with a cache and
 * last-known-good fallback): calling CoinGecko from the browser hit per-IP rate limits
 * and adblockers, which silently dropped the $ equivalents. Fails open: no price -> null usd.
 */
async function fetchPrices(): Promise<{ btc?: number; eur?: number }> {
  try {
    const res = await fetch("/api/prices", { cache: "no-store" });
    if (!res.ok) return {};
    return (await res.json()) as { btc?: number; eur?: number };
  } catch {
    return {};
  }
}

/**
 * All token balances for an account (native USDC + EURC + cirBTC), with a USDC-equivalent
 * total. Polls so DCA buys (incoming cirBTC) show up shortly after they land.
 */
export function useTokenBalances(account?: `0x${string}`) {
  return useQuery<Holdings, Error>({
    queryKey: ["token-balances", account],
    enabled: !!account,
    retry: 1,
    placeholderData: keepPreviousData, // a failed poll keeps the last good balances, not a blank/partial view
    refetchInterval: 30_000,
    queryFn: async () => {
      const [usdcRaw, eurcRaw, cirbtcRaw, prices] = await Promise.all([
        arcPublicClient.getBalance({ address: account! }),
        readErc20(EURC, account!),
        readErc20(CIRBTC, account!),
        fetchPrices(),
      ]);

      const usdcAmount = formatUnits(usdcRaw, USDC.decimals);
      const tokens: TokenHolding[] = [
        { symbol: "USDC", amount: usdcAmount, usd: parseFloat(usdcAmount) },
      ];

      if (eurcRaw > 0n) {
        const amount = formatUnits(eurcRaw, EURC.decimals);
        tokens.push({ symbol: "EURC", amount, usd: prices.eur != null ? parseFloat(amount) * prices.eur : null });
      }
      if (cirbtcRaw > 0n) {
        const amount = formatUnits(cirbtcRaw, CIRBTC.decimals);
        tokens.push({ symbol: "cirBTC", amount, usd: prices.btc != null ? parseFloat(amount) * prices.btc : null });
      }

      const totalUsd = tokens.reduce((sum, t) => sum + (t.usd ?? 0), 0);
      const hasPrices = tokens.every((t) => t.usd != null);
      return { tokens, totalUsd, hasPrices };
    },
  });
}
