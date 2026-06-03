"use client";

import { useState, useEffect, useRef } from "react";
import { arcPublicClient } from "@/shared/lib/arc";
import { env } from "@/shared/config/env";
import { SLUG_REGISTRY_ABI } from "@/entities/slug/model/abi";
import { validateSlug } from "@/entities/slug/lib/validateSlug";

export type SlugAvailabilityStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid"
  | "error";

/**
 * Debounced availability check for a slug input.
 * - Returns "idle" while input is changing (debounce pending)
 * - Returns "invalid" immediately for slugs that fail client-side validation
 * - Returns "checking" once the debounce fires and the RPC call is in-flight
 * - Returns "available" / "taken" / "error" after the call resolves
 */
export function useSlugAvailability(slug: string): SlugAvailabilityStatus {
  const [status, setStatus] = useState<SlugAvailabilityStatus>("idle");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Fast path: invalid format — no network call needed
    if (slug.length === 0) {
      setStatus("idle");
      return;
    }
    if (!validateSlug(slug)) {
      setStatus("invalid");
      return;
    }

    // While debounce is pending, show nothing
    setStatus("idle");

    const timer = setTimeout(async () => {
      // Cancel any previous in-flight check
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!env.slugRegistryAddress) {
        // Registry not configured — optimistically assume available
        setStatus("available");
        return;
      }

      setStatus("checking");

      try {
        const available = await arcPublicClient.readContract({
          address: env.slugRegistryAddress,
          abi: SLUG_REGISTRY_ABI,
          functionName: "isAvailable",
          args: [slug],
        });

        if (controller.signal.aborted) return;
        setStatus(available ? "available" : "taken");
      } catch {
        if (controller.signal.aborted) return;
        setStatus("error");
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [slug]);

  return status;
}
