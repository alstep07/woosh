"use client";

import { useCallback, useEffect, useState } from "react";
import { getRequests, saveRequest, deleteRequest } from "@/shared/lib/session";
import { isInvoicePaid } from "@/entities/invoice/lib/isInvoicePaid";
import type { PaymentRequest } from "@/entities/invoice/model/types";

/**
 * The creator's local list of payment requests, augmented with live on-chain
 * paid status. The list itself is localStorage (the creator's own links); whether
 * each is paid is read from the contract — the source of truth.
 */
export function useRequests() {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [paid, setPaid] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setRequests(getRequests());
  }, []);

  // Poll paid status for requests not yet known to be paid. Once paid, it stays paid.
  useEffect(() => {
    const pending = requests.filter((r) => !paid[r.id]);
    if (pending.length === 0) return;

    let cancelled = false;
    async function check() {
      const results = await Promise.all(
        pending.map(async (r) => [r.id, await isInvoicePaid(r.id)] as const)
      );
      if (cancelled) return;
      const newlyPaid = Object.fromEntries(results.filter(([, p]) => p));
      if (Object.keys(newlyPaid).length) setPaid((m) => ({ ...m, ...newlyPaid }));
    }

    void check();
    const t = setInterval(() => void check(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [requests, paid]);

  const add = useCallback((request: PaymentRequest) => {
    saveRequest(request);
    setRequests(getRequests());
  }, []);

  const remove = useCallback((id: string) => {
    deleteRequest(id);
    setRequests(getRequests());
  }, []);

  return { requests, paid, add, remove };
}
