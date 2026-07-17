"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getVaultHoldings } from "@/entities/savings/lib/readVault";
import { env } from "@/shared/config/env";
import type { VaultHoldings } from "@/entities/savings/model/types";

/**
 * The owner's savings vault holdings, read from WooshSavingsVault by owner address.
 * Polls so deposits/withdrawals/sweeps reflect on-chain shortly after they land.
 */
export function useVaultBalances(owner?: `0x${string}`) {
  return useQuery<VaultHoldings, Error>({
    queryKey: ["vault-balances", owner],
    enabled: !!env.savingsVaultAddress && !!owner,
    retry: 1,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData, // a failed poll keeps the last good holdings, not a blank view
    queryFn: () => getVaultHoldings(owner!),
  });
}
