"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getMyInvoices } from "@/entities/invoice/lib/readInvoice";
import type { OnchainInvoice } from "@/entities/invoice/model/types";

/**
 * The creator's payment requests, read from the contract by payee address.
 * Polls so a request flips to Paid shortly after it settles on-chain.
 */
export function useMyInvoices(creator?: `0x${string}`) {
  const query = useQuery<OnchainInvoice[], Error>({
    queryKey: ["invoices", creator],
    enabled: !!creator,
    retry: 1,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData, // don't blank the list while a background refetch is in flight
    queryFn: () => getMyInvoices(creator!),
  });

  return {
    invoices: query.data ?? [],
    loading: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}
