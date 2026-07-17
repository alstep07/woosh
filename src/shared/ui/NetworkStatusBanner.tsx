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
      // top-right, below the header row (top-20, not top-4): the header itself isn't
      // fixed, so this only ever sits over empty margin above page content instead of
      // competing with the footer links or any page's bottom action buttons, both of
      // which past positions (bottom-4, bottom-20) ended up overlapping.
      className="fixed top-20 right-4 z-50 pointer-events-none select-none"
    >
      <div className="flex items-center gap-2 rounded-input border border-border bg-navy/85 backdrop-blur-md px-3 py-1.5 shadow-lg">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/80 animate-pulse" aria-hidden="true" />
        <span className="text-xs text-text-secondary">Connection issue</span>
      </div>
    </div>
  );
}
