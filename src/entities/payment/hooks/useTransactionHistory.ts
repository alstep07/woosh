"use client";

import { useQuery } from "@tanstack/react-query";
import type { TxRecord } from "@/entities/payment/model/types";

export function useTransactionHistory(address?: `0x${string}`) {
  return useQuery<TxRecord[], Error>({
    queryKey: ["tx-history", address],
    enabled: !!address,
    retry: 0,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await fetch(`/api/transactions/${address}`);
      if (!res.ok) return [];
      return res.json() as Promise<TxRecord[]>;
    },
  });
}
