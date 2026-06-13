/**
 * A payment request, as stored on-chain in WooshInvoiceRegistry. The contract is the
 * source of truth — amount, memo, payee and paid status all live there. The client
 * reads this; it keeps no off-chain copy.
 */
export type OnchainInvoice = {
  id: `0x${string}`;
  payee: `0x${string}`;            // who gets paid (the requester)
  amount: string;                  // human decimal, e.g. "50"
  paid: boolean;
  payer: `0x${string}` | null;     // who paid, once paid
  memo: string;                    // what it's for
};
