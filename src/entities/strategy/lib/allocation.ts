import type { PortfolioLeg } from "@/entities/strategy/model/types";

/** Weights are basis points, 10000 = 100%. Mirrors BPS_DENOM in WooshStrategyRegistry. */
export const BPS_DENOM = 10_000;

/** bps of the USDC leg (token === null). 0 if the portfolio has no USDC leg. */
export function usdcBps(legs: PortfolioLeg[]): number {
  return legs.find((l) => l.token === null)?.bps ?? 0;
}

/** The legs that get swapped (everything except the USDC leg). */
export function swapLegs(legs: PortfolioLeg[]): PortfolioLeg[] {
  return legs.filter((l) => l.token !== null);
}

/**
 * Split `amount` (base units, bigint — no floats) proportionally to `weights`.
 * Each share floor-divides; the LAST entry absorbs the rounding remainder so the
 * shares always sum to exactly `amount`.
 */
export function splitProportional(amount: bigint, weights: number[]): bigint[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || amount <= 0n || weights.length === 0) return weights.map(() => 0n);
  const out = weights.map((w) => (amount * BigInt(w)) / BigInt(total));
  const assigned = out.reduce((a, b) => a + b, 0n);
  out[out.length - 1] += amount - assigned;
  return out;
}

/**
 * Deposit mode: how one released period divides. Mirrors the contract exactly:
 * usdcShare = amount * usdcBps / 10000 (floor, sent straight to the owner on-chain),
 * swapShare = the rest (sent to the executor), split across the swap legs here.
 */
export function splitDepositPeriod(
  amountPerPeriod: bigint,
  legs: PortfolioLeg[]
): { usdcShare: bigint; swapShare: bigint; legAmounts: { leg: PortfolioLeg; amount: bigint }[] } {
  const usdcShare = (amountPerPeriod * BigInt(usdcBps(legs))) / BigInt(BPS_DENOM);
  const swapShare = amountPerPeriod - usdcShare;
  const targets = swapLegs(legs);
  const amounts = splitProportional(swapShare, targets.map((l) => l.bps));
  return {
    usdcShare,
    swapShare,
    legAmounts: targets.map((leg, i) => ({ leg, amount: amounts[i] })),
  };
}

/**
 * Sweep mode: how much to pull for a given wallet excess. Only the swap share is ever
 * pulled — the USDC leg's share of the excess simply stays in the owner's wallet. The
 * result is floored to a whole 6-decimal ERC-20 unit (the precompile's granularity)
 * and clamped to the per-period cap.
 */
export function sweepPullAmount(
  excess18: bigint,
  cap18: bigint,
  legs: PortfolioLeg[]
): { amount6: bigint; amount18: bigint } {
  if (excess18 <= 0n) return { amount6: 0n, amount18: 0n };
  const nonUsdc = BigInt(BPS_DENOM - usdcBps(legs));
  let pull = (excess18 * nonUsdc) / BigInt(BPS_DENOM);
  if (pull > cap18) pull = cap18;
  const amount6 = pull / 1_000_000_000_000n; // 18-dec native -> 6-dec ERC-20 units
  return { amount6, amount18: amount6 * 1_000_000_000_000n };
}
