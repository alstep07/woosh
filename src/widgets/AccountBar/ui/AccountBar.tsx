"use client";

import { useState, useRef, useEffect } from "react";
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
  onCreateInvoice?: () => void;
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

function KebabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="13" cy="8" r="1.4" />
    </svg>
  );
}

export default function AccountBar({
  balance,
  isLoading,
  isError,
  paymentLink,
  walletAddress,
  slug,
  onCreateInvoice,
  holdings,
  totalUsd,
}: Props) {
  const [copied, setCopied] = useState<null | "link" | "address">(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the menu on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Reset the "Copied!" hint whenever the menu reopens
  useEffect(() => {
    if (menuOpen) setCopied(null);
  }, [menuOpen]);

  async function copy(which: "link" | "address") {
    await navigator.clipboard.writeText(which === "link" ? paymentLink : walletAddress);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  const itemClass = "block w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-white/5 transition-colors";
  const chipClass = "flex items-center gap-1.5 h-9 px-3 sm:px-4 rounded-input bg-blue-primary/10 hover:bg-blue-primary/20 text-blue-primary text-xs sm:text-sm font-medium transition-colors whitespace-nowrap";

  return (
    <div className="flex items-start justify-between py-5">
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

      {/* Right: copy-link chip + actions menu, same height side by side */}
      <div className="flex items-center gap-1.5 ml-4">
        {slug ? (
          <button onClick={() => copy("link")} className={chipClass}>
            {copied === "link" ? (
              "Copied!"
            ) : (
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

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Account actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center justify-center h-9 w-9 rounded-input bg-blue-primary/10 hover:bg-blue-primary/20 text-blue-primary transition-colors"
          >
            <KebabIcon />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1.5 z-[60] min-w-[200px] rounded-input border border-[#1E293B] bg-[#0d1222] py-1"
              style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
            >
              <button role="menuitem" onClick={() => copy("address")} className={itemClass}>
                {copied === "address" ? "Copied!" : "Copy wallet address"}
              </button>
              <div className="my-1 border-t border-border" />
              <Link
                href="/pay"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className={itemClass}
              >
                Send payment
              </Link>
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); onCreateInvoice?.(); }}
                className={itemClass}
              >
                Create invoice
              </button>
              <Link
                href="/dashboard/invoices"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className={itemClass}
              >
                My invoices
              </Link>
              <Link
                href="/dashboard/strategies"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className={itemClass}
              >
                Strategies
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
