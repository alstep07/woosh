"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "@/shared/lib/wagmi";
import { NetworkStatusBanner } from "@/shared/ui/NetworkStatusBanner";
import { useState } from "react";
import "@rainbow-me/rainbowkit/styles.css";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Every page mounts 1-3 polling queries (strategies, invoices, vault,
            // balances, tx history). Without this, the default refetchOnWindowFocus
            // fires ALL of them at once on every tab-focus, on top of their own
            // refetchInterval — the main source of RPC burst 429s during testing
            // (alt-tabbing repeatedly re-triggers every active query simultaneously).
            refetchOnWindowFocus: false,
            // A short floor so mounting the same query from two components within a
            // moment of each other (e.g. navigating between pages) reuses the
            // in-flight/just-fetched data instead of firing a second RPC round trip.
            staleTime: 5_000,
            retry: 1,
            retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 10_000),
          },
        },
      })
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor: "#0EA5E9",
          accentColorForeground: "white",
          borderRadius: "medium",
        })}>
          {children}
          {/* Global "degraded network" toast: shows while any active query is erroring. */}
          <NetworkStatusBanner />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
