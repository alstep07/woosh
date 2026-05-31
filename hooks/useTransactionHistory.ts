"use client";

import { useQuery } from "@tanstack/react-query";

export type TxRecord = {
  hash: `0x${string}`;
  from: `0x${string}`;
  amount: string;   // formatted USDC e.g. "50.00"
  timestamp: number; // unix seconds
};

export function useTransactionHistory(address?: `0x${string}`) {
  return useQuery<TxRecord[], Error>({
    queryKey: ["tx-history", address],
    enabled: !!address,
    retry: 1,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await fetch(`/api/transactions/${address}`);
      if (!res.ok) return [];
      return res.json() as Promise<TxRecord[]>;
    },
  });
}
