import { keccak256, encodeAbiParameters, parseUnits } from "viem";

/**
 * Deterministic invoice id — MUST match WooshInvoiceRegistry.invoiceId on-chain:
 *   keccak256(abi.encode(address payee, uint256 amount, uint256 nonce))
 * Amount is the human decimal (e.g. "50"); Arc native USDC = 18 decimals.
 */
export function computeInvoiceId(
  payee: `0x${string}`,
  amount: string,
  nonce: string
): `0x${string}` {
  const amountWei = parseUnits(amount, 18);
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "uint256" }],
      [payee, amountWei, BigInt(nonce)]
    )
  );
}

/** Random uint256-range nonce (decimal string) so repeat requests stay unique. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n.toString();
}
