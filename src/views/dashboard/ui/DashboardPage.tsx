"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUSDCBalance } from "@/entities/wallet/hooks/useUSDCBalance";
import { useTokenBalances } from "@/entities/wallet/hooks/useTokenBalances";
import { useTransactionHistory } from "@/entities/payment/hooks/useTransactionHistory";
import AppHeader from "@/widgets/AppHeader/ui/AppHeader";
import AccountBar from "@/widgets/AccountBar/ui/AccountBar";
import WalletCard from "@/widgets/WalletCard/ui/WalletCard";
import ChatPanel from "@/widgets/ChatPanel/ui/ChatPanel";
import TransactionList from "@/widgets/TransactionList/ui/TransactionList";
import Footer from "@/widgets/Footer/ui/Footer";
import { Spinner } from "@/shared/ui/Spinner";
import { env } from "@/shared/config/env";
import { getSession as loadSession } from "@/shared/lib/session";
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

  const { data: holdings } = useTokenBalances(session?.walletAddress);

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

  const identifier = session ? (session.slug ?? session.walletAddress) : "";
  const paymentLink = session ? `${env.baseUrl}/pay/${identifier}` : "";

  if (!session) {
    return (
      <main className="h-screen bg-navy flex items-center justify-center">
        <Spinner size="lg" />
      </main>
    );
  }

  const recentPayments = (
    <>
      <TransactionList
        txs={txs?.slice(0, pendingTx ? 4 : 5)}
        isLoading={txsLoading}
        isError={txsError}
        onRefresh={handleTxRefresh}
        isRefreshing={isTxRefreshing}
        pendingEntries={pendingTx ? [pendingTx] : undefined}
      />
      {txs && txs.length > 5 && (
        <div className="flex justify-end mt-3">
          <Link
            href="/dashboard/history"
            className="text-xs text-blue-primary/60 hover:text-blue-primary transition-colors"
          >
            View all transactions
          </Link>
        </div>
      )}
    </>
  );

  return (
    <main className="h-screen bg-navy flex flex-col overflow-hidden">
      <div className="woosh-bg" aria-hidden="true" />
      <div className="relative z-20 shrink-0">
        <AppHeader />
      </div>
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden px-4 sm:px-6 pt-6 lg:pt-8 pb-6">
        <div className="max-w-6xl mx-auto w-full min-w-0 lg:h-full lg:px-8 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">

          {/* Mobile only: compact balance + slug + actions dropdown */}
          <div className="lg:hidden mb-4">
            <AccountBar
              balance={balance?.display}
              isLoading={balanceLoading}
              isError={balanceError}
              paymentLink={paymentLink}
              walletAddress={session.walletAddress}
              slug={session.slug}
              holdings={holdings?.tokens}
              totalUsd={holdings?.totalUsd}
            />
          </div>

          {/* Chat — single instance; right on desktop, primary. Fills row height on
              desktop (internal scroll); fixed tall block on mobile. */}
          <div className="lg:order-2 lg:col-span-6 min-w-0 h-[60vh] lg:h-full lg:min-h-0 mb-4 lg:mb-0">
            <ChatPanel
              name={session.slug}
              walletAddress={session.walletAddress}
              userEmail={session.email}
              onPaymentSuccess={handlePaymentSuccess}
              knownCounterparties={txs?.map((tx) => tx.counterparty)}
            />
          </div>

          {/* Desktop only: one cohesive wallet card with recent payments inside.
              Left column, stretched to full height. */}
          <div className="hidden lg:block lg:order-1 lg:col-span-6 lg:h-full lg:min-h-0 min-w-0">
            <WalletCard
              balance={balance?.display}
              isLoading={balanceLoading}
              isError={balanceError}
              paymentLink={paymentLink}
              walletAddress={session.walletAddress}
              slug={session.slug}
              holdings={holdings?.tokens}
              totalUsd={holdings?.totalUsd}
            >
              {recentPayments}
            </WalletCard>
          </div>

          {/* Mobile only: recent payments */}
          <div className="lg:hidden">{recentPayments}</div>
        </div>
      </div>
      <div className="relative z-10 shrink-0">
        <Footer />
      </div>
    </main>
  );
}
