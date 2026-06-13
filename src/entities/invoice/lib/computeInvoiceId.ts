import { keccak256, encodeAbiParameters } from "viem";

/**
 * Deterministic invoice id — MUST match WooshInvoiceRegistry.invoiceId on-chain:
 *   keccak256(abi.encode(address creator, uint256 salt))
 * Lets the client derive the id (for the share link) right after create(), without
 * waiting to read it back from the chain.
 */
export function computeInvoiceId(creator: `0x${string}`, salt: string): `0x${string}` {
  return keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [creator, BigInt(salt)])
  );
}

/** Random uint256-range salt (decimal string) so each request gets a unique id. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n.toString();
}
