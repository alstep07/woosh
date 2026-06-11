"use client";

import { useQuery } from "@tanstack/react-query";
import { lookupAddressSlug } from "@/entities/slug/lib/lookupAddressSlug";
import { env } from "@/shared/config/env";

/**
 * Resolves a list of addresses to their registered slugs.
 * Returns a map of lowercased address → slug for addresses that have one.
 * Deduplicates, caches for 60s, and no-ops if the registry is unconfigured.
 */
export function useSlugMap(addresses: string[]): { map: Record<string, string>; isLoading: boolean } {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].filter(Boolean);
  const enabled = unique.length > 0 && !!env.slugRegistryAddress;

  const { data, isLoading } = useQuery({
    queryKey: ["slug-map", unique.slice().sort().join(",")],
    enabled,
    staleTime: 60_000,
    retry: 0,
    queryFn: async () => {
      const entries = await Promise.all(
        unique.map(async (addr) => {
          const slug = await lookupAddressSlug(addr as `0x${string}`);
          return [addr, slug] as [string, string | null];
        })
      );
      return Object.fromEntries(entries.filter((e): e is [string, string] => e[1] !== null));
    },
  });

  return { map: data ?? {}, isLoading: enabled && isLoading };
}
