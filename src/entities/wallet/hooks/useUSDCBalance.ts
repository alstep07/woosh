"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { arcPublicClient } from "@/shared/lib/arc";
import type { BalanceResult } from "@/entities/wallet/model/types";

export function useUSDCBalance(address?: `0x${string}`) {
  return useQuery<BalanceResult, Error>({
    queryKey: ["usdc-balance", address],
    enabled: !!address,
    retry: 1,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData, // a failed poll keeps the last good balance, not a blank
    queryFn: async () => {
      const raw = await arcPublicClient.getBalance({ address: address! });
      const formatted = parseFloat(formatUnits(raw, 18)).toFixed(2);
      const display = `$${formatted}`;
      return { raw, formatted, display };
    },
  });
}
