"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { TxRecord } from "@/entities/payment/model/types";

export function useTransactionHistory(address?: `0x${string}`) {
  return useQuery<TxRecord[], Error>({
    queryKey: ["tx-history", address],
    enabled: !!address,
    retry: 1,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData, // a failed poll keeps the last good list, not a blank view
    queryFn: async () => {
      const res = await fetch(`/api/transactions/${address}`);
      // Throw on failure so react-query surfaces isError. Returning [] here made an
      // API/Blockscout hiccup indistinguishable from "no transactions yet".
      if (!res.ok) throw new Error(`transactions API ${res.status}`);
      return res.json() as Promise<TxRecord[]>;
    },
  });
}
