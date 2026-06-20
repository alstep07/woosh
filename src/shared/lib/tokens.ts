/**
 * Supported tokens for swaps and DCA on Arc. USDC is the native value token (18 decimals,
 * no contract address). EURC and cirBTC are ERC-20 targets reached via different swap
 * rails: EURC over Circle StableFX (USDC<->EURC only), cirBTC over Circle App Kit.
 *
 * Addresses are sourced from docs/ARCHITECTURE.md; cirBTC is read from env because its
 * testnet address must be confirmed from Arc docs before going live.
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
