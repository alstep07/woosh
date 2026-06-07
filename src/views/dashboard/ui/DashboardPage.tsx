"use client";

import { useEffect, useState } from "react";
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
import type { Session } from "@/entities/user/model/types";

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

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

  const {
    data: balance,
    isLoading: balanceLoading,
    isError: balanceError,
  } = useUSDCBalance(session?.walletAddress);

  const [isTxRefreshing, setIsTxRefreshing] = useState(false);
  const { data: txs, isLoading: txsLoading, isError: txsError, refetch: refetchTxs } =
    useTransactionHistory(session?.walletAddress);

  async function handleTxRefresh() {
    setIsTxRefreshing(true);
    await refetchTxs();
    setIsTxRefreshing(false);
  }

  const identifier = session ? (session.slug ?? session.walletAddress) : "";
  const paymentLink = session ? `${env.baseUrl}/pay/${identifier}` : "";

  function handleLogout() {
    localStorage.removeItem("woosh_session");
    try {
      sessionStorage.removeItem("woosh_session_token");
      sessionStorage.removeItem("woosh_session_enc_key");
      sessionStorage.removeItem("woosh_chat_history");
    } catch {}
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
                  {session.email}
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
        <div className="px-4 sm:px-6 max-w-2xl mx-auto w-full pb-8 min-w-0">
          <AccountBar
            balance={balance?.display}
            isLoading={balanceLoading}
            isError={balanceError}
            paymentLink={paymentLink}
            slug={session.slug}
          />
          <ChatPanel name={session.slug} walletAddress={session.walletAddress} userEmail={session.email} />
          <TransactionList
            txs={txs?.slice(0, 3)}
            isLoading={txsLoading}
            isError={txsError}
            onRefresh={handleTxRefresh}
            isRefreshing={isTxRefreshing}
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
      <div className="relative z-10 shrink-0">
        <Footer />
      </div>
    </main>
  );
}
