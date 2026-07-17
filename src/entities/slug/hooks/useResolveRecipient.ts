"use client";

import { useEffect, useRef, useState } from "react";
import { resolveSlug } from "@/entities/slug/lib/resolveSlug";

export type RecipientResolveStatus = "idle" | "loading" | "valid" | "invalid";

/**
 * Debounced live resolution of a recipient input (slug or 0x address) to a wallet
 * address, for the "who am I paying" status icon. Mirrors useSlugAvailability's
 * debounce/abort shape but resolves TO an address instead of checking availability.
 */
export function useResolveRecipient(raw: string): {
  status: RecipientResolveStatus;
  resolvedAddress: `0x${string}` | null;
} {
  const [status, setStatus] = useState<RecipientResolveStatus>("idle");
  const [resolvedAddress, setResolvedAddress] = useState<`0x${string}` | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const input = raw.trim().replace(/^@/, "");
    if (!input) {
      setStatus("idle");
      setResolvedAddress(null);
      return;
    }

    setStatus("idle");

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("loading");

      const resolved = await resolveSlug(/^0x/i.test(input) ? input : input.toLowerCase());
      if (controller.signal.aborted) return;

      if (resolved) {
        setResolvedAddress(resolved);
        setStatus("valid");
      } else {
        setResolvedAddress(null);
        setStatus("invalid");
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [raw]);

  return { status, resolvedAddress };
}
