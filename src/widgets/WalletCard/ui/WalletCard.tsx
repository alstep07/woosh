"use client";

import { useState } from "react";
import Link from "next/link";

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
}: Props) {
  const [copied, setCopied] = useState<null | "address" | "link">(null);

  async function copy(which: "address" | "link") {
    await navigator.clipboard.writeText(which === "link" ? paymentLink : walletAddress);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="glass-card rounded-card p-5 flex flex-col h-full min-h-0">
      {/* Identity row: slug chip (copies the share link) + raw wallet address (copies 0x) */}
      <div className="flex items-center justify-between gap-2 mb-4">
        {slug ? (
          <button
            onClick={() => copy("link")}
            className="flex items-center gap-1.5 bg-blue-primary/10 hover:bg-blue-primary/20 text-blue-primary px-3 py-1 rounded-full text-sm font-medium transition-colors"
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
            className="flex items-center bg-blue-primary/10 hover:bg-blue-primary/20 text-blue-primary px-3 py-1 rounded-full text-sm font-medium transition-colors"
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

      {/* Balance — focal point */}
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1">
        Balance
      </p>
      {isLoading ? (
        <div className="h-9 w-32 bg-border rounded animate-pulse" />
      ) : isError ? (
        <p className="text-3xl font-bold text-text-secondary/40">—</p>
      ) : (
        <p className="text-3xl font-bold text-text-primary">
          {balance ?? "$0.00"}
          <span className="text-base font-medium text-text-secondary/50 ml-1.5">USDC</span>
        </p>
      )}

      {/* Invoices entry — the one secondary action, kept visible */}
      <div className="mt-3 pl-1">
        <Link
          href="/dashboard/invoices"
          className="text-sm font-medium text-blue-primary hover:text-blue-secondary transition-colors"
        >
          Invoices
        </Link>
      </div>

      <div className="my-4 border-t border-border shrink-0" />

      {/* Recent payments — fills the remaining height, scrolls internally if long */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {children}
      </div>
    </div>
  );
}
