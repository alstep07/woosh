"use client";

import { useState } from "react";
import Link from "next/link";

interface Props {
  balance: string | undefined;
  isLoading: boolean;
  isError: boolean;
  paymentLink: string;
  slug?: string;
}

export default function AccountBar({
  balance,
  isLoading,
  isError,
  paymentLink,
  slug,
}: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(paymentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-start justify-between py-5">
      {/* Left: balance */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
            Balance
          </p>
        </div>

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

      {/* Right: payment link */}
      <div className="flex flex-col items-end gap-2 min-w-0 ml-4">
        <button
          onClick={copyLink}
          className="text-xs sm:text-sm bg-blue-primary/10 hover:bg-blue-primary/20 text-blue-primary px-3 sm:px-4 py-2 rounded-input font-medium transition-colors whitespace-nowrap"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        {!slug ? (
          <Link
            href="/slug-setup"
            className="text-xs text-blue-primary/60 hover:text-blue-primary transition-colors whitespace-nowrap"
          >
            Claim username
          </Link>
        ) : (
          <span className="text-xs text-text-secondary/60 font-mono truncate max-w-[130px] sm:max-w-[200px]">{paymentLink.replace(/^https?:\/\//, "")}</span>
        )}
      </div>
    </div>
  );
}
