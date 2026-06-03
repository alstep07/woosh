"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUSDCBalance } from "@/entities/wallet/hooks/useUSDCBalance";
import { useTransactionHistory } from "@/entities/payment/hooks/useTransactionHistory";
import BrandHeader from "@/widgets/BrandHeader/ui/BrandHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import BalanceCard from "@/widgets/BalanceCard/ui/BalanceCard";
import PaymentLinkCard from "@/widgets/PaymentLinkCard/ui/PaymentLinkCard";
import TransactionList from "@/widgets/TransactionList/ui/TransactionList";
import { Spinner } from "@/shared/ui/Spinner";
import { env } from "@/shared/config/env";
import type { Session } from "@/entities/user/model/types";

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
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
  const { data: txs, isLoading: txsLoading, isError: txError, refetch: refetchTxs } = useTransactionHistory(
    session?.walletAddress
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([refetchBalance(), refetchTxs()]);
    setIsRefreshing(false);
  }

  const identifier = session ? (session.slug ?? session.walletAddress) : "";
  const paymentLink = session ? `${env.baseUrl}/pay/${identifier}` : "";

  function handleLogout() {
    localStorage.removeItem("woosh_session");
    router.replace("/");
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-navy flex items-center justify-center">
        <Spinner size="lg" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy relative flex flex-col">
      {/* Subtle background so glass cards have something to blur */}
      <div className="woosh-bg" aria-hidden="true" />
      <div className="relative z-10">
        <BrandHeader rightSlot={
          <div className="flex flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-4">
            {session.email && (
              <span className="text-xs text-text-secondary/50 order-2 sm:order-1">{session.email}</span>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors order-1 sm:order-2"
            >
              Log out
            </button>
          </div>
        } />
      </div>
      <div className="relative z-10 flex-1 px-6 py-6 max-w-2xl mx-auto w-full">
        <BalanceCard
          balance={balance?.display}
          isLoading={balanceLoading}
          isError={balanceError}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
        />
        <PaymentLinkCard
          walletAddress={session.walletAddress}
          paymentLink={paymentLink}
          slug={session.slug}
        />
        <TransactionList
          txs={txs}
          isLoading={txsLoading}
          isError={txError}
        />
      </div>
      <Footer />
    </main>
  );
}
