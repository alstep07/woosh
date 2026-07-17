"use client";

interface Props {
  onRefresh: () => void;
  isRefreshing?: boolean;
  className?: string;
}

/**
 * Small icon-only refresh button, extracted from BalanceCard so every page that reads
 * onchain data (Payments, Swap, Savings, Invoices, Dashboard) uses the exact same
 * circular-arrows glyph, spin animation, and muted color instead of each page
 * reinventing its own "refresh" affordance.
 */
export function RefreshButton({ onRefresh, isRefreshing = false, className = "" }: Props) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isRefreshing}
      className={`text-text-secondary/50 hover:text-text-secondary transition-colors disabled:opacity-30 ${className}`}
      title="Refresh"
      aria-label="Refresh"
    >
      <svg
        className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  );
}
