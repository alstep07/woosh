"use client";

import { arcTestnet } from "@/shared/lib/arc";
import { formatDistanceToNow } from "@/shared/lib/time";
import { useSlugMap } from "@/entities/slug/hooks/useSlugMap";
import type { TxRecord } from "@/entities/payment/model/types";

interface PendingEntry {
  counterparty: string;
  amount: string; // formatted, e.g. "10.00"
}

interface Props {
  txs: TxRecord[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  skeletonCount?: number;
  pendingEntries?: PendingEntry[];
}

export default function TransactionList({
  txs,
  isLoading,
  isError,
  onRefresh,
  isRefreshing,
  skeletonCount = 3,
  pendingEntries,
}: Props) {
  const allCounterparties = [
    ...(txs?.map((tx) => tx.counterparty) ?? []),
    ...(pendingEntries?.map((e) => e.counterparty) ?? []),
  ];
  const { map: slugMap, isLoading: slugsLoading } = useSlugMap(allCounterparties);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
          Recent payments
        </p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-blue-primary/60 hover:text-blue-primary transition-colors disabled:opacity-20"
            title="Refresh"
          >
            <svg
              className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="divide-y divide-border/40">
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-1 py-2.5">
              <div className="h-4 w-44 bg-border rounded animate-pulse" />
              <div className="h-4 w-10 bg-border rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="glass-card rounded-card px-3 py-2.5 text-text-secondary text-xs">
          Could not load transactions.
        </div>
      ) : !txs || txs.length === 0 ? (
        <div className="glass-card rounded-card px-3 py-4 text-center">
          <p className="text-text-secondary text-xs">
            No payments yet. Share your link to get started.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/40">
          {pendingEntries?.map((entry, i) => (
            <div key={`pending-${i}`} className="flex items-center justify-between px-1 py-2.5">
              <div>
                <p className="text-xs text-text-secondary/50">
                  Sent to{" "}
                  {slugsLoading ? (
                    <span className="inline-block h-3 w-16 bg-border rounded animate-pulse align-middle" />
                  ) : slugMap[entry.counterparty.toLowerCase()] ? (
                    <span className="text-text-secondary/80">@{slugMap[entry.counterparty.toLowerCase()]}</span>
                  ) : (
                    <span className="font-mono">{entry.counterparty.slice(0, 6)}…{entry.counterparty.slice(-4)}</span>
                  )}
                  {" · "}just now
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-primary animate-pulse" />
                <span className="text-xs text-text-secondary">-${entry.amount}</span>
              </div>
            </div>
          ))}
          {txs.map((tx) => (
            <a
              key={tx.hash}
              href={`${arcTestnet.blockExplorers.default.url}/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-1 py-2.5 hover:opacity-70 transition-opacity"
            >
              <div>
                <p className="text-xs text-text-secondary/50">
                  {tx.direction === "received" ? "Received from" : "Sent to"}{" "}
                  {slugsLoading ? (
                    <span className="inline-block h-3 w-16 bg-border rounded animate-pulse align-middle" />
                  ) : slugMap[tx.counterparty.toLowerCase()] ? (
                    <span className="text-text-secondary/80">@{slugMap[tx.counterparty.toLowerCase()]}</span>
                  ) : (
                    <span className="font-mono">{tx.counterparty.slice(0, 6)}…{tx.counterparty.slice(-4)}</span>
                  )}
                  {" · "}
                  {formatDistanceToNow(tx.timestamp)}
                </p>
              </div>
              <span className={`text-xs shrink-0 ml-4 ${tx.direction === "received" ? "text-green-400" : "text-text-secondary"}`}>
                {tx.direction === "received" ? "+" : "-"}${tx.amount}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
