/**
 * A payment request ("invoice"). The on-chain truth is just `paid[id]`; everything
 * else here is the off-chain description the creator keeps locally to rebuild the link
 * and show their own list. `id` is derived (see computeInvoiceId), never stored on-chain
 * until the request is actually paid.
 */
export type PaymentRequest = {
  id: `0x${string}`;       // invoiceId = keccak256(payee, amountWei, nonce)
  payee: `0x${string}`;    // recipient wallet address
  slug?: string;           // recipient slug used to build the link, if any
  amount: string;          // human decimal, e.g. "50"
  nonce: string;           // uint256 as a decimal string
  memo?: string;           // off-chain display label, never enforced on-chain
  createdAt: number;       // ms epoch
  link: string;            // shareable pay URL
};
