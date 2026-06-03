"use client";

import { arcTestnet } from "@/shared/lib/arc";
import { formatDistanceToNow } from "@/shared/lib/time";
import type { TxRecord } from "@/entities/payment/model/types";

interface Props {
  txs: TxRecord[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

export default function TransactionList({ txs, isLoading, isError }: Props) {
  return (
    <div>
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-4">
        Recent payments
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 glass-card rounded-card animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="glass-card rounded-card p-6 text-text-secondary text-sm">
          Could not load transactions. Check your connection and refresh.
        </div>
      ) : !txs || txs.length === 0 ? (
        <div className="glass-card rounded-card p-8 text-center">
          <p className="text-text-secondary text-sm">
            No payments yet. Share your link to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {txs.map((tx) => (
            <a
              key={tx.hash}
              href={`${arcTestnet.blockExplorers.default.url}/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-card rounded-card px-4 py-3 flex items-center justify-between hover:border-blue-primary/50 transition-colors"
            >
              <div>
                <p className="text-xs text-text-secondary/50 mb-0.5">
                  {tx.direction === "received" ? "Received from" : "Sent to"}
                </p>
                <p className="text-sm font-mono text-text-secondary">
                  {tx.counterparty.slice(0, 6)}…{tx.counterparty.slice(-4)}
                </p>
                <p className="text-xs text-text-secondary/60 mt-0.5">
                  {formatDistanceToNow(tx.timestamp)}
                </p>
              </div>
              <span className={`font-semibold text-sm ${tx.direction === "received" ? "text-green-400" : "text-text-secondary"}`}>
                {tx.direction === "received" ? "+" : "-"}${tx.amount}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
