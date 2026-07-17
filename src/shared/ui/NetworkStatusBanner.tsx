"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Quiet, corner-anchored indicator shown while one or more actively observed queries
 * are in an error state (RPC 429s, Blockscout hiccups). One banner regardless of how
 * many queries are failing; it clears itself as soon as the next poll/retry succeeds,
 * so there is nothing to dismiss. Mounted once in Providers, applies app-wide.
 *
 * pointer-events-none: purely informational, must never block interaction.
 */
export function NetworkStatusBanner() {
  const queryClient = useQueryClient();
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const update = () => {
      // Only queries something is currently rendering (observed); a stale errored
      // query left behind by an unmounted page should not keep the banner up.
      setDegraded(
        cache
          .getAll()
          .some((q) => q.state.status === "error" && q.getObserversCount() > 0)
      );
    };
    update();
    return cache.subscribe(update);
  }, [queryClient]);

  if (!degraded) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // bottom-20 (not bottom-4): the footer sits at the bottom of every page, and a
      // fixed bottom-right element at a small offset renders on top of its links
      // (Explorer/Faucet/GitHub, "Built on Arc"), not just past the end of the page.
      className="fixed bottom-20 right-4 z-50 pointer-events-none select-none"
    >
      <div className="flex items-center gap-2 rounded-input border border-border bg-navy/85 backdrop-blur-md px-3.5 py-2 shadow-lg">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/80 animate-pulse" aria-hidden="true" />
        <span className="text-xs text-text-secondary">
          Some data couldn&apos;t load. Retrying, check your connection.
        </span>
      </div>
    </div>
  );
}
