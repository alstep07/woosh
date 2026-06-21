export type TxRecord = {
  hash: `0x${string}`;
  from: `0x${string}`;
  counterparty: `0x${string}`;
  direction: "sent" | "received";
  amount: string;   // formatted USDC e.g. "50.00"
  timestamp: number; // unix seconds
  note?: string;     // e.g. "Invoice" / "Strategy" / "DCA", how the tx settled
  memo?: string;     // the invoice memo (what it was for), when known
  token?: string;    // ERC-20 symbol (e.g. "cirBTC", "EURC") when not native USDC
};
