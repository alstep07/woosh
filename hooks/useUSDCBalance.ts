"use client";

import { useQuery } from "@tanstack/react-query";
import { arcPublicClient } from "@/lib/arc";
import { formatUnits } from "viem";

type BalanceResult = {
  raw: bigint;
  formatted: string; // e.g. "120.50"
  display: string;   // e.g. "$120.50"
};

export function useUSDCBalance(address?: `0x${string}`) {
  return useQuery<BalanceResult, Error>({
    queryKey: ["usdc-balance", address],
    enabled: !!address,
    retry: 0,
    refetchInterval: 15_000,
    queryFn: async () => {
      const raw = await arcPublicClient.getBalance({ address: address! });
      const formatted = parseFloat(formatUnits(raw, 18)).toFixed(2);
      const display = `$${formatted}`;
      return { raw, formatted, display };
    },
  });
}
