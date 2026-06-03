import { arcPublicClient } from "@/shared/lib/arc";
import { env } from "@/shared/config/env";
import { SLUG_REGISTRY_ABI } from "@/entities/slug/model/abi";

/**
 * Look up the slug registered to a wallet address.
 * Returns null if the address has no slug, registry is not configured, or RPC fails.
 */
export async function lookupAddressSlug(
  address: `0x${string}`
): Promise<string | null> {
  if (!env.slugRegistryAddress) return null;
  try {
    const slug = await arcPublicClient.readContract({
      address: env.slugRegistryAddress,
      abi: SLUG_REGISTRY_ABI,
      functionName: "addressToSlug",
      args: [address],
    });
    return slug && slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}
