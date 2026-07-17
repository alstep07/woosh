/**
 * An automated strategy, as stored on-chain in WooshStrategyRegistry. The contract is
 * the source of truth — config, schedule, balance and status all live there. The client
 * reads this; it keeps no off-chain copy.
 *
 * Three kinds:
 * - "payment": recurring USDC transfer to `recipient` every `intervalSeconds`.
 * - "swap": DCA — convert `amountPerPeriod` USDC into `tokenOut` every `intervalSeconds`.
 * - "portfolio": target allocation across tokens (e.g. 50% USDC / 30% cirBTC / 20% EURC),
 *   funded per period from a custodied budget ("deposit") or by pulling the owner's
 *   wallet balance above a threshold ("sweep", one-time allowance to the registry).
 */
export type StrategyKind = "payment" | "swap" | "portfolio";

export type PortfolioMode = "deposit" | "sweep";

/** One allocation leg. token === null is the USDC leg (kept as USDC, never swapped). */
export type PortfolioLeg = { token: `0x${string}` | null; bps: number };

export type PortfolioConfig = {
  legs: PortfolioLeg[];          // bps sum to 10000
  mode: PortfolioMode;
  sweepThreshold: string;        // human decimal USDC; "0" unless mode === "sweep"
};

export type StrategyStatus = "active" | "paused" | "completed" | "cancelled" | "depleted";

export type OnchainStrategy = {
  id: `0x${string}`;
  owner: `0x${string}`;
  kind: StrategyKind;
  recipient: `0x${string}` | null;   // payment only
  tokenOut: `0x${string}` | null;    // swap only
  amountPerPeriod: string;           // human decimal USDC, e.g. "10"
  intervalSeconds: number;
  periodsTotal: number;              // 0 = open-ended (runs until funds run out)
  periodsDone: number;
  nextRunAt: number;                 // unix seconds
  balance: string;                   // human decimal USDC still custodied
  status: StrategyStatus;
  createdAt: number;                 // unix seconds
  portfolio: PortfolioConfig | null; // portfolio only
};

export const STRATEGY_KIND_ENUM: Record<StrategyKind, number> = {
  payment: 0,
  swap: 1,
  portfolio: 2,
};

export const PORTFOLIO_MODE_ENUM: Record<PortfolioMode, number> = {
  deposit: 0,
  sweep: 1,
};

export const STRATEGY_STATUS_BY_ENUM: StrategyStatus[] = [
  "active",
  "paused",
  "completed",
  "cancelled",
  "depleted",
];
