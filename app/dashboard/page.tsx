"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUSDCBalance } from "@/hooks/useUSDCBalance";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { formatDistanceToNow } from "@/lib/time";

type Session = {
  email: string;
  slug: string;
  walletAddress: `0x${string}`;
};

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("woosh_session");
    if (!raw) {
      router.replace("/signup");
      return;
    }
    try {
      setSession(JSON.parse(raw) as Session);
    } catch {
      router.replace("/signup");
    }
  }, [router]);

  const { data: balance, isError: balanceError } = useUSDCBalance(
    session?.walletAddress
  );
  const { data: txs, isError: txError } = useTransactionHistory(
    session?.walletAddress
  );

  const paymentLink = session ? `woosh.app/pay/${session.slug}` : "";

  async function copyLink() {
    await navigator.clipboard.writeText(`https://${paymentLink}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-navy flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-primary border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy px-6 py-10 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <span className="text-xl font-bold">woosh</span>
        <span className="text-sm text-text-secondary">{session.email}</span>
      </div>

      {/* Balance */}
      <div className="bg-card border border-border rounded-card p-6 mb-4">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1">
          Your balance
        </p>
        {balanceError ? (
          <p className="text-text-secondary text-sm">Balance unavailable</p>
        ) : balance ? (
          <p className="text-4xl font-bold text-text-primary">{balance.display}</p>
        ) : (
          <div className="h-10 w-32 bg-border rounded animate-pulse" />
        )}
      </div>

      {/* Payment link */}
      <div className="bg-card border border-border rounded-card p-6 mb-8">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-3">
          Your payment link
        </p>
        <div className="flex items-center gap-3">
          <span className="text-blue-primary text-sm font-mono flex-1 truncate">
            {paymentLink}
          </span>
          <button
            onClick={copyLink}
            className="flex-shrink-0 text-xs bg-blue-primary/10 hover:bg-blue-primary/20 text-blue-primary px-3 py-1.5 rounded-input transition-colors min-h-[44px] min-w-[64px]"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Transaction history */}
      <div>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-4">
          Recent payments
        </p>

        {txError ? (
          <div className="bg-card border border-border rounded-card p-6 text-text-secondary text-sm">
            Could not load transactions. Check your connection and refresh.
          </div>
        ) : !txs ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 bg-card border border-border rounded-card animate-pulse"
              />
            ))}
          </div>
        ) : txs.length === 0 ? (
          <div className="bg-card border border-border rounded-card p-8 text-center">
            <p className="text-text-secondary text-sm">
              No payments yet. Share your link to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {txs.map((tx) => (
              <div
                key={tx.hash}
                className="bg-card border border-border rounded-card px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-mono text-text-secondary">
                    {tx.from.slice(0, 6)}…{tx.from.slice(-4)}
                  </p>
                  <p className="text-xs text-text-secondary/60 mt-0.5">
                    {formatDistanceToNow(tx.timestamp)}
                  </p>
                </div>
                <span className="text-text-primary font-semibold text-sm">
                  +${tx.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
