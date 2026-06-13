"use client";

import { useState } from "react";
import Link from "next/link";

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

  const actionClass = "text-xs text-text-secondary/50 hover:text-text-primary transition-colors";

  return (
    <div className="glass-card rounded-card p-5 flex flex-col h-full min-h-0">
      {/* Public identity — the /pay/<slug> link, distinct from the raw wallet */}
      <div className="mb-3">
        {slug ? (
          <span className="inline-flex items-center bg-blue-primary/10 text-blue-primary px-3 py-1 rounded-full text-sm font-medium">
            /pay/{slug}
          </span>
        ) : (
          <Link
            href="/slug-setup"
            className="inline-flex items-center bg-blue-primary/10 hover:bg-blue-primary/20 text-blue-primary px-3 py-1 rounded-full text-sm font-medium transition-colors"
          >
            Claim username
          </Link>
        )}
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

      {/* Secondary actions — quiet, muted */}
      <div className="flex items-center gap-2 mt-3">
        <button onClick={() => copy("address")} className={actionClass}>
          {copied === "address" ? "Copied!" : "Copy address"}
        </button>
        <span className="text-text-secondary/20">·</span>
        <Link href="/dashboard/invoices" className={actionClass}>
          Invoices
        </Link>
        <span className="text-text-secondary/20">·</span>
        <button onClick={() => copy("link")} className={actionClass}>
          {copied === "link" ? "Copied!" : "Share link"}
        </button>
      </div>

      <div className="my-4 border-t border-border shrink-0" />

      {/* Recent payments — fills the remaining height, scrolls internally if long */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {children}
      </div>
    </div>
  );
}
