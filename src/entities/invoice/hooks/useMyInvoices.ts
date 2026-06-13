"use client";

import { useCallback, useEffect, useState } from "react";
import { getMyInvoices } from "@/entities/invoice/lib/readInvoice";
import type { OnchainInvoice } from "@/entities/invoice/model/types";

/**
 * The creator's payment requests, read from the contract by payee address.
 * Polls so a request flips to Paid shortly after it settles on-chain.
 */
export function useMyInvoices(creator?: `0x${string}`) {
  const [invoices, setInvoices] = useState<OnchainInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!creator) return;
    const list = await getMyInvoices(creator);
    setInvoices(list);
    setLoading(false);
  }, [creator]);

  useEffect(() => {
    void refetch();
    if (!creator) return;
    const t = setInterval(() => void refetch(), 15_000);
    return () => clearInterval(t);
  }, [creator, refetch]);

  return { invoices, loading, refetch };
}
