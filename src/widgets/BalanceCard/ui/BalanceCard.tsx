"use client";

import { RefreshButton } from "@/shared/ui/RefreshButton";

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
        <RefreshButton onRefresh={onRefresh} isRefreshing={isRefreshing} />
      </div>
      {isLoading ? (
        <div className="h-10 w-32 bg-border rounded animate-pulse" />
      ) : /* A background poll can fail (429, transient timeout) after we already have a
             good cached balance. isError must not hide a real number we're still
             holding, only show "unavailable" when there's truly nothing cached. */
      balance !== undefined ? (
        <p className="text-4xl font-bold text-text-primary">{balance}</p>
      ) : isError ? (
        <p className="text-text-secondary text-sm">Balance unavailable</p>
      ) : (
        <p className="text-4xl font-bold text-text-primary">$0.00</p>
      )}
    </div>
  );
}
