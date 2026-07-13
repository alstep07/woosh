/**
 * Supported tokens for swaps and DCA on Arc. USDC is the native value token (18 decimals,
 * no contract address). EURC and cirBTC are ERC-20 swap targets; on Arc testnet all
 * swaps route through the Synthra SynRoute API (see src/shared/lib/synroute.ts).
 * The SwapRail type is kept for when Circle rails get testnet routes.
 *
 * Addresses are listed in README.md (Smart contracts table); cirBTC is read from env
 * because its testnet address must be confirmed from Arc docs before going live.
 */
import { env } from "@/shared/config/env";

export type SwapRail = "stablefx" | "appkit";

export type SupportedToken = {
  symbol: string;
  label: string;
  /** null = native USDC (no ERC-20 contract). */
  address: `0x${string}` | null;
  decimals: number;
  /** Which rail converts USDC into this token. null for USDC itself. */
  swapRail: SwapRail | null;
};

export const USDC: SupportedToken = {
  symbol: "USDC",
  label: "USD Coin",
  address: null,
  decimals: 18, // native on Arc
  swapRail: null,
};

/**
 * USDC as an ERC-20 for swaps. On Arc, USDC is the native gas token (18-decimal value via
 * msg.value / getBalance), but the ERC-20 interface at this precompile reports 6 decimals
 * over the SAME balance. LI.FI / DEX swaps use this 6-decimal representation, so swap amounts
 * must be converted from native 18-dec to 6-dec (divide by 1e12).
 */
export const USDC_ERC20_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
export const USDC_SWAP_DECIMALS = 6;

export const EURC: SupportedToken = {
  symbol: "EURC",
  label: "Euro Coin",
  address: (env.eurcAddress ?? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as `0x${string}`,
  decimals: 6,
  swapRail: "stablefx",
};

export const CIRBTC: SupportedToken = {
  symbol: "cirBTC",
  label: "Circle BTC",
  address: env.cirbtcAddress ?? null,
  decimals: 8,
  swapRail: "appkit",
};

/** Tokens a DCA strategy can buy with USDC. cirBTC is only selectable once configured. */
export const SWAP_TARGETS: SupportedToken[] = [EURC, CIRBTC];

export function tokenByAddress(address?: string | null): SupportedToken | undefined {
  if (!address) return USDC;
  const lower = address.toLowerCase();
  return [USDC, EURC, CIRBTC].find((t) => t.address?.toLowerCase() === lower);
}

export function tokenBySymbol(symbol?: string | null): SupportedToken | undefined {
  if (!symbol) return undefined;
  const lower = symbol.toLowerCase();
  return [USDC, EURC, CIRBTC].find((t) => t.symbol.toLowerCase() === lower);
}
