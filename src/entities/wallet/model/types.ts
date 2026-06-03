export type BalanceResult = {
  raw: bigint;
  formatted: string; // e.g. "120.50"
  display: string;   // e.g. "$120.50"
};
