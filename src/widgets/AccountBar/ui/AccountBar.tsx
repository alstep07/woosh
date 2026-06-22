"use client";

import { useState } from "react";
import Link from "next/link";
import { BalanceSummary } from "@/widgets/WalletCard/ui/BalanceSummary";
import type { TokenHolding } from "@/entities/wallet/hooks/useTokenBalances";

interface Props {
  balance: string | undefined;
  isLoading: boolean;
  isError: boolean;
  paymentLink: string;
  walletAddress: string;
  slug?: string;
  holdings?: TokenHolding[];
  totalUsd?: number;
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 9.5H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Mobile-only compact account summary: balance + the public identity chip (copies the
 * share link) and a quiet copy-address control. Navigation now lives in the app header
 * burger, so this no longer carries an actions menu.
 */
export default function AccountBar({
  balance,
  isLoading,
  isError,
  paymentLink,
  walletAddress,
  slug,
  holdings,
  totalUsd,
}: Props) {
  const [copied, setCopied] = useState<null | "link" | "address">(null);

  async function copy(which: "link" | "address") {
    await navigator.clipboard.writeText(which === "link" ? paymentLink : walletAddress);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  const chipClass =
    "flex items-center gap-1.5 h-9 px-3 rounded-input bg-blue-primary/10 hover:bg-blue-primary/20 text-blue-primary text-xs font-medium transition-colors whitespace-nowrap";

  return (
    <div className="flex items-start justify-between py-2">
      {/* Left: balance */}
      <div className="min-w-0">
        <BalanceSummary
          balance={balance}
          isLoading={isLoading}
          isError={isError}
          holdings={holdings}
          totalUsd={totalUsd}
        />
      </div>

      {/* Right: share-link chip + copy-address */}
      <div className="flex flex-col items-end gap-1.5 ml-4 shrink-0">
        {slug ? (
          <button onClick={() => copy("link")} className={chipClass}>
            {copied === "link" ? "Copied!" : (
              <>
                <span>{slug}</span>
                <CopyIcon />
              </>
            )}
          </button>
        ) : (
          <Link href="/slug-setup" className={chipClass}>
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
    </div>
  );
}
