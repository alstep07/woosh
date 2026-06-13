"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUSDCBalance } from "@/entities/wallet/hooks/useUSDCBalance";
import { useTransactionHistory } from "@/entities/payment/hooks/useTransactionHistory";
import BrandHeader from "@/widgets/BrandHeader/ui/BrandHeader";
import AccountBar from "@/widgets/AccountBar/ui/AccountBar";
import ChatPanel from "@/widgets/ChatPanel/ui/ChatPanel";
import TransactionList from "@/widgets/TransactionList/ui/TransactionList";
import Footer from "@/widgets/Footer/ui/Footer";
import { Spinner } from "@/shared/ui/Spinner";
import { env } from "@/shared/config/env";
import { getSession as loadSession, clearAll } from "@/shared/lib/session";
import type { Session } from "@/entities/user/model/types";

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/signup"); return; }
    setSession(s);
  }, [router]);

  const {
    data: balance,
    isLoading: balanceLoading,
    isError: balanceError,
    refetch: refetchBalance,
  } = useUSDCBalance(session?.walletAddress);

  const [isTxRefreshing, setIsTxRefreshing] = useState(false);
  const { data: txs, isLoading: txsLoading, isError: txsError, refetch: refetchTxs } =
    useTransactionHistory(session?.walletAddress);

  const [pendingTx, setPendingTx] = useState<{ amount: string; counterparty: string } | null>(null);
  // Track tx count at payment time so we can detect when new data arrives
  const txCountAtPaymentRef = useRef<number | null>(null);

  // Clear the optimistic entry the moment a new tx appears in the fetched data —
  // no gap, no flash. Falls back to 10s safety-net if Blockscout is very slow.
  useEffect(() => {
    if (txCountAtPaymentRef.current === null || !pendingTx) return;
    if ((txs?.length ?? 0) > txCountAtPaymentRef.current) {
      txCountAtPaymentRef.current = null;
      setPendingTx(null);
    }
  }, [txs, pendingTx]);

  async function handleTxRefresh() {
    setIsTxRefreshing(true);
    await refetchTxs();
    setIsTxRefreshing(false);
  }

  function handlePaymentSuccess(amount: string, counterparty: string) {
    void refetchBalance();
    txCountAtPaymentRef.current = txs?.length ?? 0;
    setPendingTx({ amount: parseFloat(amount).toFixed(2), counterparty });
    // Poll twice — Blockscout usually indexes within 2–4s
    setTimeout(() => void refetchTxs(), 2500);
    setTimeout(() => void refetchTxs(), 5000);
    // Safety net: always clear after 10s
    setTimeout(() => {
      txCountAtPaymentRef.current = null;
      setPendingTx(null);
    }, 10_000);
  }

  function formatEmail(email: string, maxLocal = 6): string {
    const at = email.indexOf("@");
    if (at === -1 || at <= maxLocal) return email;
    return `${email.slice(0, maxLocal)}…${email.slice(at)}`;
  }

  const identifier = session ? (session.slug ?? session.walletAddress) : "";
  const paymentLink = session ? `${env.baseUrl}/pay/${identifier}` : "";

  function handleLogout() {
    clearAll();
    router.replace("/");
  }

  if (!session) {
    return (
      <main className="h-screen bg-navy flex items-center justify-center">
        <Spinner size="lg" />
      </main>
    );
  }

  return (
    <main className="h-screen bg-navy flex flex-col overflow-hidden">
      <div className="woosh-bg" aria-hidden="true" />
      <div className="relative z-10">
        <BrandHeader
          rightSlot={
            <div className="flex flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-4">
              {session.email && (
                <span className="text-xs text-text-secondary/50 order-2 sm:order-1">
                  <span className="sm:hidden">{formatEmail(session.email)}</span>
                  <span className="hidden sm:inline">{session.email}</span>
                </span>
              )}
              <button
                onClick={handleLogout}
                className="text-sm text-text-secondary hover:text-text-primary transition-colors order-1 sm:order-2"
              >
                Log out
              </button>
            </div>
          }
        />
      </div>
      <div className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-4 sm:px-6 max-w-5xl mx-auto w-full pb-8 min-w-0 lg:grid lg:grid-cols-5 lg:gap-6 lg:items-start">
          {/* Primary: chat (left, ~60% on desktop; first on mobile) */}
          <div className="lg:col-span-3 min-w-0">
            <ChatPanel
              name={session.slug}
              walletAddress={session.walletAddress}
              userEmail={session.email}
              onPaymentSuccess={handlePaymentSuccess}
              knownCounterparties={txs?.map((tx) => tx.counterparty)}
            />
          </div>

          {/* Secondary: balance + recent payments (right, ~40%) */}
          <div className="lg:col-span-2 min-w-0">
            <AccountBar
              balance={balance?.display}
              isLoading={balanceLoading}
              isError={balanceError}
              paymentLink={paymentLink}
              walletAddress={session.walletAddress}
              slug={session.slug}
            />
            <TransactionList
              txs={txs?.slice(0, pendingTx ? 2 : 3)}
              isLoading={txsLoading}
              isError={txsError}
              onRefresh={handleTxRefresh}
              isRefreshing={isTxRefreshing}
              pendingEntries={pendingTx ? [pendingTx] : undefined}
            />
            {txs && txs.length > 3 && (
              <div className="flex justify-end mt-3">
                <Link
                  href="/dashboard/history"
                  className="text-xs text-blue-primary/60 hover:text-blue-primary transition-colors"
                >
                  View all transactions
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="relative z-10 shrink-0">
        <Footer />
      </div>
    </main>
  );
}
