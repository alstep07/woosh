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
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 9.5H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
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

      {/* Right: payment link + address */}
      <div className="flex flex-col items-end gap-1.5 min-w-0 ml-4">
        <button
          onClick={copyLink}
          className="flex items-center gap-1.5 text-xs sm:text-sm bg-blue-primary/10 hover:bg-blue-primary/20 text-blue-primary px-3 sm:px-4 py-2 rounded-input font-medium transition-colors whitespace-nowrap"
        >
          {copiedLink ? (
            "Copied!"
          ) : slug ? (
            <>
              <span>{slug}</span>
              <CopyIcon />
            </>
          ) : (
            "Copy link"
          )}
        </button>

        {!slug ? (
          <Link
            href="/slug-setup"
            className="text-xs text-blue-primary/60 hover:text-blue-primary transition-colors whitespace-nowrap"
          >
            Claim username
          </Link>
        ) : (
          <button
            onClick={copyAddress}
            className="text-xs font-mono text-text-secondary/40 hover:text-text-secondary transition-colors"
          >
            {copiedAddress ? "Copied!" : shortAddress}
          </button>
        )}
      </div>
    </div>
  );
}
