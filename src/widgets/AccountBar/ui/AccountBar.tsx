"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface Props {
  balance: string | undefined;
  isLoading: boolean;
  isError: boolean;
  paymentLink: string;
  walletAddress: string;
  slug?: string;
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

  const shortAddress = `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;
  const itemClass = "block w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-white/5 transition-colors";

  return (
    <div className="flex items-start justify-between py-5">
      {/* Left: balance */}
      <div>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1">
          Balance
        </p>
        {isLoading ? (
          <div className="h-8 w-28 bg-border rounded animate-pulse" />
        ) : isError ? (
          <p className="text-2xl font-bold text-text-secondary/40">—</p>
        ) : (
          <p className="text-3xl font-bold text-text-primary">
            {balance ?? "$0.00"}
          </p>
        )}
      </div>

      {/* Right: identity label + actions menu */}
      <div className="flex items-center gap-2 ml-4">
        {slug ? (
          <span className="text-sm font-medium text-blue-primary">{slug}</span>
        ) : (
          <span className="text-xs font-mono text-text-secondary/40">{shortAddress}</span>
        )}

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Account actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center justify-center w-9 h-9 rounded-input text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            <KebabIcon />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] rounded-input border border-border bg-card shadow-xl py-1"
            >
              <button role="menuitem" onClick={() => copy("link")} className={itemClass}>
                {copied === "link" ? "Copied!" : "Copy payment link"}
              </button>
              <button role="menuitem" onClick={() => copy("address")} className={itemClass}>
                {copied === "address" ? "Copied!" : "Copy wallet address"}
              </button>
              <div className="my-1 border-t border-border" />
              <Link
                href="/dashboard/requests"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className={itemClass}
              >
                Request a payment
              </Link>
              {!slug && (
                <Link
                  href="/slug-setup"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className={itemClass}
                >
                  Claim username
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
