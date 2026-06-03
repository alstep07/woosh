"use client";

interface Props {
  balance: string | undefined;
  isLoading: boolean;
  isError: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export default function BalanceCard({ balance, isLoading, isError, isRefreshing, onRefresh }: Props) {
  return (
    <div className="glass-card rounded-card p-6 mb-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
          Balance
        </p>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="text-text-secondary/50 hover:text-text-secondary transition-colors disabled:opacity-30"
          title="Refresh"
        >
          <svg
            className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      {isLoading ? (
        <div className="h-10 w-32 bg-border rounded animate-pulse" />
      ) : isError ? (
        <p className="text-text-secondary text-sm">Balance unavailable</p>
      ) : (
        <p className="text-4xl font-bold text-text-primary">{balance ?? "$0.00"}</p>
      )}
    </div>
  );
}
