/**
 * An automated strategy, as stored on-chain in WooshStrategyRegistry. The contract is
 * the source of truth — config, schedule, balance and status all live there. The client
 * reads this; it keeps no off-chain copy.
 *
 * Two kinds:
 * - "payment": recurring USDC transfer to `recipient` every `intervalSeconds`.
 * - "swap": DCA — convert `amountPerPeriod` USDC into `tokenOut` every `intervalSeconds`.
 */
export type StrategyKind = "payment" | "swap";

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
};

export const STRATEGY_KIND_ENUM: Record<StrategyKind, number> = {
  payment: 0,
  swap: 1,
};

export const STRATEGY_STATUS_BY_ENUM: StrategyStatus[] = [
  "active",
  "paused",
  "completed",
  "cancelled",
  "depleted",
];
