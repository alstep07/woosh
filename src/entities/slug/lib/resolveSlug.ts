import { arcPublicClient } from "@/shared/lib/arc";
import { env } from "@/shared/config/env";
import { SLUG_REGISTRY_ABI } from "@/entities/slug/model/abi";

/**
 * Resolve a pay-page slug to a wallet address.
 * - If the input is already a 42-char 0x address, return it directly.
 * - Otherwise read slugToAddress from the registry contract.
 * - Returns null if slug is unresolvable, registry is not configured, or RPC fails.
 */
export async function resolveSlug(
  slug: string
): Promise<`0x${string}` | null> {
  // Pass-through for raw addresses (V1 links still work)
  if (/^0x[0-9a-fA-F]{40}$/.test(slug)) {
    return slug as `0x${string}`;
  }

  if (!env.slugRegistryAddress) return null;

  try {
    const address = await arcPublicClient.readContract({
      address: env.slugRegistryAddress,
      abi: SLUG_REGISTRY_ABI,
      functionName: "slugToAddress",
      args: [slug],
    });
    // Zero address means not registered
    if (!address || address === "0x0000000000000000000000000000000000000000") {
      return null;
    }
    return address;
  } catch {
    return null;
  }
}
