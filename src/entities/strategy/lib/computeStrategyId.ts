import { keccak256, encodeAbiParameters } from "viem";

/**
 * Deterministic strategy id — MUST match WooshStrategyRegistry.strategyId on-chain:
 *   keccak256(abi.encode(address owner, uint256 salt))
 * Lets the client derive the id right after create(), without reading it back.
 */
export function computeStrategyId(owner: `0x${string}`, salt: string): `0x${string}` {
  return keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [owner, BigInt(salt)])
  );
}

/** Random uint256-range salt (decimal string) so each strategy gets a unique id. */
export function newStrategySalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n.toString();
}
