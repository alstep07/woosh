"use client";

import { useState } from "react";
import Link from "next/link";
import { BalanceSummary } from "@/widgets/WalletCard/ui/BalanceSummary";
import type { TokenHolding } from "@/entities/wallet/hooks/useTokenBalances";

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 9.5H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  balance: string | undefined;
  isLoading: boolean;
  isError: boolean;
  paymentLink: string;
  walletAddress: string;
  slug?: string;
  children: React.ReactNode; // recent payments
  holdings?: TokenHolding[]; // all token balances (USDC, EURC, cirBTC)
  totalUsd?: number;         // USDC-equivalent total across all tokens
}

/**
 * Desktop wallet card: one cohesive card with the public identity (slug pill),
 * the balance as the focal point, a quiet row of secondary actions, then the
 * recent-payments list under a divider. Actions are muted by default — the chat
 * input is the primary action on the screen, not these.
 */
export default function WalletCard({
  balance,
  isLoading,
  isError,
  paymentLink,
  walletAddress,
  slug,
  children,
  holdings,
  totalUsd,
}: Props) {
  const [copied, setCopied] = useState<null | "address" | "link">(null);

  async function copy(which: "address" | "link") {
    await navigator.clipboard.writeText(which === "link" ? paymentLink : walletAddress);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="glass-card rounded-card p-6 flex flex-col h-full min-h-0">
      {/* Identity row: slug chip (copies the share link) + raw wallet address (copies 0x) */}
      <div className="flex items-center justify-between gap-2 mb-5">
        {slug ? (
          <button
            onClick={() => copy("link")}
            className="flex items-center gap-1.5 bg-blue-primary/10 hover:bg-blue-primary/20 text-blue-primary px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            {copied === "link" ? "Copied!" : (
              <>
                <span>{slug}</span>
                <CopyIcon />
              </>
            )}
          </button>
        ) : (
          <Link
            href="/slug-setup"
            className="flex items-center bg-blue-primary/10 hover:bg-blue-primary/20 text-blue-primary px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            Claim username
          </Link>
        )}

        <button
          onClick={() => copy("address")}
          title="Copy wallet address"
          className="flex items-center gap-1.5 font-mono text-xs text-text-secondary/50 hover:text-text-primary transition-colors"
        >
          {copied === "address" ? "Copied!" : (
            <>
              <span>{walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}</span>
              <CopyIcon />
            </>
          )}
        </button>
      </div>

      {/* Balance — total in USDC-equivalent as the focal point, itemized below */}
      <BalanceSummary
        balance={balance}
        isLoading={isLoading}
        isError={isError}
        holdings={holdings}
        totalUsd={totalUsd}
      />

      <div className="mt-5 mb-5 border-t border-border shrink-0" />

      {/* Recent payments — fills the remaining height, scrolls internally if long */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {children}
      </div>
    </div>
  );
}
