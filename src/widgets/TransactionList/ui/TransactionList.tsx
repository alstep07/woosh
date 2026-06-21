"use client";

import { arcTestnet } from "@/shared/lib/arc";
import { formatDistanceToNow } from "@/shared/lib/time";
import { useSlugMap } from "@/entities/slug/hooks/useSlugMap";
import type { TxRecord } from "@/entities/payment/model/types";

interface PendingEntry {
  counterparty: string;
  amount: string; // formatted, e.g. "10.00"
}

/** Per-type icon badge: every row gets one, distinct by what the tx is. */
function TxIcon({ tx }: { tx: TxRecord }) {
  const type =
    tx.note === "Invoice" ? "invoice"
    : tx.note === "Strategy payment" ? "recurring"
    : tx.note === "DCA" ? "dca"
    : tx.note === "Strategy" ? "strategy"
    : tx.token ? "token"
    : tx.direction === "received" ? "received"
    : "sent";

  const cls: Record<string, string> = {
    received: "bg-green-400/10 text-green-400",
    sent: "bg-white/[0.06] text-text-secondary",
    invoice: "bg-blue-primary/10 text-blue-primary",
    recurring: "bg-blue-secondary/10 text-blue-secondary",
    dca: "bg-amber-400/10 text-amber-400",
    strategy: "bg-blue-primary/10 text-blue-primary",
    token: "bg-amber-400/10 text-amber-400",
  };

  const paths: Record<string, React.ReactNode> = {
    // arrow down-left into tray
    received: <path strokeLinecap="round" strokeLinejoin="round" d="M19 5L8 16m0 0h7m-7 0V9" />,
    // arrow up-right
    sent: <path strokeLinecap="round" strokeLinejoin="round" d="M5 19L16 8m0 0H9m7 0v7" />,
    // document
    invoice: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h4m4 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    // circular arrows (recurring)
    recurring: <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 006 5.3M4 15a8 8 0 0014 3.7" />,
    // swap arrows (DCA)
    dca: <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />,
    // automation / bolt (strategy deposit)
    strategy: <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />,
    // coin (token)
    token: <><circle cx="12" cy="12" r="8" /><path strokeLinecap="round" d="M12 8v8M9.5 10.5h3a1.5 1.5 0 010 3h-3" /></>,
  };

  return (
    <span
      className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center ${cls[type]}`}
      title={tx.note ?? (tx.direction === "received" ? "Received" : "Sent")}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        {paths[type]}
      </svg>
    </span>
  );
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
              <div className="flex items-center gap-2 min-w-0">
                <TxIcon tx={tx} />
                <p className="text-xs text-text-secondary/50 min-w-0 truncate">
                  {tx.note ? (
                    <>
                      {tx.direction === "received" ? "Received" : "Sent"}{" "}
                      <span className="text-text-secondary/80">
                        · {tx.note}
                        {tx.memo ? `: ${tx.memo.length > 24 ? `${tx.memo.slice(0, 24)}…` : tx.memo}` : ""}
                      </span>
                    </>
                  ) : (
                    <>
                      {tx.direction === "received" ? "Received from" : "Sent to"}{" "}
                      {slugsLoading ? (
                        <span className="inline-block h-3 w-16 bg-border rounded animate-pulse align-middle" />
                      ) : slugMap[tx.counterparty.toLowerCase()] ? (
                        <span className="text-text-secondary/80">@{slugMap[tx.counterparty.toLowerCase()]}</span>
                      ) : (
                        <span className="font-mono">{tx.counterparty.slice(0, 6)}…{tx.counterparty.slice(-4)}</span>
                      )}
                    </>
                  )}
                  {" · "}
                  {formatDistanceToNow(tx.timestamp)}
                </p>
              </div>
              <span className={`text-xs shrink-0 ml-4 ${tx.direction === "received" ? "text-green-400" : "text-text-secondary"}`}>
                {tx.direction === "received" ? "+" : "-"}
                {tx.token ? `${tx.amount} ${tx.token}` : `$${tx.amount}`}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
