"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getMyStrategies } from "@/entities/strategy/lib/readStrategy";
import type { OnchainStrategy } from "@/entities/strategy/model/types";

/**
 * The owner's automated strategies, read from the contract by owner address.
 * Polls so status/next-run/balance reflect on-chain executions shortly after they land.
 * Shared cache keyed by owner: Payments, Swap and Savings all read the same list (each
 * filters by kind client-side), so mounting more than one at once dedupes into a
 * single poll instead of one independent RPC loop per page.
 */
export function useMyStrategies(owner?: `0x${string}`) {
  const query = useQuery<OnchainStrategy[], Error>({
    queryKey: ["strategies", owner],
    enabled: !!owner,
    retry: 1,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData, // don't blank the list while a background refetch is in flight
    queryFn: () => getMyStrategies(owner!),
  });

  return {
    strategies: query.data ?? [],
    loading: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}
