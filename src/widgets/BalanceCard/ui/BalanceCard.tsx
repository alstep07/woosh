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
      ) : isError ? (
        <p className="text-text-secondary text-sm">Balance unavailable</p>
      ) : (
        <p className="text-4xl font-bold text-text-primary">{balance ?? "$0.00"}</p>
      )}
    </div>
  );
}
