export type TxRecord = {
  hash: `0x${string}`;
  from: `0x${string}`;
  counterparty: `0x${string}`;
  direction: "sent" | "received";
  amount: string;   // formatted USDC e.g. "50.00"
  timestamp: number; // unix seconds
};
