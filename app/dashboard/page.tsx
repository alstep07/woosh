"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUSDCBalance } from "@/hooks/useUSDCBalance";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { formatDistanceToNow } from "@/lib/time";
import BrandHeader from "@/components/BrandHeader";
import Footer from "@/components/Footer";
import { arcTestnet } from "@/lib/arc";

type Session = {
  email: string;
  walletAddress: `0x${string}`;
};

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const { data: balance, isLoading: balanceLoading, isError: balanceError, refetch: refetchBalance } = useUSDCBalance(
    session?.walletAddress
  );
  const { data: txs, isLoading: txsLoading, isError: txError, refetch: refetchTxs, isFetching: txsFetching } = useTransactionHistory(
    session?.walletAddress
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([refetchBalance(), refetchTxs()]);
    setIsRefreshing(false);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const paymentLink = session ? `${baseUrl}/pay/${session.walletAddress}` : "";

  function handleLogout() {
    localStorage.removeItem("woosh_session");
    router.replace("/");
  }

  async function copyLink() {
    await navigator.clipboard.writeText(paymentLink);
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
    <main className="min-h-screen bg-navy relative flex flex-col">
      {/* Subtle background so glass cards have something to blur */}
      <div className="woosh-bg" aria-hidden="true" />
      <div className="relative z-10">
      <BrandHeader rightSlot={
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-secondary hidden sm:block">{session.email}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Log out
          </button>
        </div>
      } />
      </div>
      <div className="relative z-10 flex-1 px-6 py-6 max-w-2xl mx-auto w-full">

      {/* Balance */}
      <div className="glass-card rounded-card p-6 mb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
            Balance
          </p>
          <button
            onClick={handleRefresh}
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
        {balanceLoading ? (
          <div className="h-10 w-32 bg-border rounded animate-pulse" />
        ) : balanceError ? (
          <p className="text-text-secondary text-sm">Balance unavailable</p>
        ) : (
          <p className="text-4xl font-bold text-text-primary">{balance?.display ?? "$0.00"}</p>
        )}
      </div>

      {/* Payment link */}
      <div className="glass-card rounded-card p-6 mb-8">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1">
          Payment link
        </p>
        <p className="text-xs text-text-secondary/60 font-mono mb-4">
          {session.walletAddress.slice(0, 10)}…{session.walletAddress.slice(-8)}
        </p>
        <button
          onClick={copyLink}
          className="w-full bg-blue-primary hover:bg-blue-secondary text-white font-semibold py-3 rounded-input transition-colors shadow-glow min-h-[44px] text-sm"
        >
          {copied ? "Copied!" : "Copy payment link"}
        </button>
      </div>

      {/* Transaction history */}
      <div>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-4">
          Recent payments
        </p>

        {txsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 glass-card rounded-card animate-pulse"
              />
            ))}
          </div>
        ) : txError ? (
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
      </div>
      <Footer />
    </main>
  );
}
