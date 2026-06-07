"use client";

import { useState } from "react";
import Link from "next/link";

interface Props {
  walletAddress: `0x${string}`;
  paymentLink: string;
  slug?: string;
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 9.5H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export default function PaymentLinkCard({ walletAddress, paymentLink, slug }: Props) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(paymentLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  async function copyAddress() {
    await navigator.clipboard.writeText(walletAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  }

  const shortAddress = `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;

  const label = slug
    ? slug
    : `${walletAddress.slice(0, 10)}…${walletAddress.slice(-8)}`;

  return (
    <div className="glass-card rounded-card p-6 mb-8">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1">
            Payment link
          </p>
          <p className="text-xs text-text-secondary/60 font-mono">
            {label}
          </p>
        </div>

        {!slug && (
          <div className="flex items-center gap-1.5 shrink-0 ml-4">
            <Link
              href="/slug-setup"
              className="text-xs text-blue-primary hover:text-blue-secondary transition-colors whitespace-nowrap"
            >
              Claim a username
            </Link>
            <div className="relative group">
              <svg
                width="13"
                height="13"
                viewBox="0 0 13 13"
                fill="none"
                className="text-text-secondary/50 hover:text-text-secondary transition-colors cursor-default"
              >
                <circle cx="6.5" cy="6.5" r="6" stroke="currentColor" />
                <path
                  d="M6.5 5.5v4M6.5 3.5v.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              <div
                role="tooltip"
                className="pointer-events-none absolute top-full right-0 mt-2 w-52 rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 z-10"
              >
                Register a short username — your link becomes{" "}
                <span className="text-text-primary font-mono">woosh.app/pay/yourname</span>
                <span className="absolute right-2 -top-[5px] h-2.5 w-2.5 rotate-45 border-t border-l border-border bg-card" />
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={copyLink}
        className="w-full bg-blue-primary hover:bg-blue-secondary text-white font-semibold py-3 rounded-input transition-colors shadow-glow min-h-[44px] text-sm flex items-center justify-center gap-2"
      >
        {copiedLink ? (
          "Copied!"
        ) : slug ? (
          <>
            <span>{slug}</span>
            <CopyIcon />
          </>
        ) : (
          "Copy payment link"
        )}
      </button>

      <button
        onClick={copyAddress}
        className="mt-2 w-full text-center text-xs font-mono text-text-secondary/40 hover:text-text-secondary transition-colors"
      >
        {copiedAddress ? "Copied!" : shortAddress}
      </button>
    </div>
  );
}
