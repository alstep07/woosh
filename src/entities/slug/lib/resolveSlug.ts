import { arcPublicClient } from "@/shared/lib/arc";
import { env } from "@/shared/config/env";
import { SLUG_REGISTRY_ABI } from "@/entities/slug/model/abi";

/**
 * Resolve a pay-page slug to a wallet address.
 * - If the input is already a 42-char 0x address, return it directly.
 * - Otherwise read slugToAddress from the registry contract.
 * - Returns null if the slug is genuinely unregistered, or the registry isn't configured.
 * - THROWS if the RPC read itself fails (timeout, 429, node error). Callers must not
 *   treat a thrown error the same as null: an RPC hiccup is not "this slug doesn't
 *   exist", and collapsing the two produced a real bug (a transient RPC failure at
 *   send time surfaced as a false "Recipient not found" for a slug that was valid).
 */
export async function resolveSlug(
  slug: string
): Promise<`0x${string}` | null> {
  // Pass-through for raw addresses (V1 links still work)
  if (/^0x[0-9a-fA-F]{40}$/.test(slug)) {
    return slug as `0x${string}`;
  }

  if (!env.slugRegistryAddress) return null;

  let address: `0x${string}`;
  try {
    address = await arcPublicClient.readContract({
      address: env.slugRegistryAddress,
      abi: SLUG_REGISTRY_ABI,
      functionName: "slugToAddress",
      args: [slug],
    });
  } catch (err) {
    console.error("[resolveSlug] RPC read failed", slug, err);
    throw new Error("Couldn't verify the recipient right now. Try again in a moment.");
  }

  // Zero address means not registered
  if (!address || address === "0x0000000000000000000000000000000000000000") {
    return null;
  }
  return address;
}
