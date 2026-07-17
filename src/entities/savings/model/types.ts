/**
 * A user's holdings in WooshSavingsVault, separate from their spendable wallet
 * balance. The contract is the source of truth; the client keeps no off-chain copy.
 * Amounts are human-decimal strings (never floats): USDC is 18-dec native, EURC
 * 6-dec, cirBTC 8-dec.
 */
export type SweepRuleInfo = {
  threshold: string;       // human decimal USDC, wallet is never pulled below this
  capPerRun: string;       // human decimal USDC, max pulled per run
  intervalSeconds: number; // min gap between runs
  nextRunAt: number;       // unix seconds, next eligible run
  enabled: boolean;
};

export type VaultHoldings = {
  usdc: string;   // human decimal
  eurc: string;   // human decimal
  cirbtc: string; // human decimal
  sweepRule: SweepRuleInfo;
};
