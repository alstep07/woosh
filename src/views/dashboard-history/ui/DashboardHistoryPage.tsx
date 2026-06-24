"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTransactionHistory } from "@/entities/payment/hooks/useTransactionHistory";
import AppHeader from "@/widgets/AppHeader/ui/AppHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import TransactionList from "@/widgets/TransactionList/ui/TransactionList";
import { getSession as loadSession } from "@/shared/lib/session";
import type { Session } from "@/entities/user/model/types";

export default function DashboardHistoryPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/signup"); return; }
    setSession(s);
  }, [router]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data: txs, isLoading, isError, refetch } = useTransactionHistory(
    session?.walletAddress
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-navy flex items-center justify-center">
        <span className="shimmer-text text-sm font-medium">Loading…</span>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <div className="woosh-bg" aria-hidden="true" />
      <div className="relative z-20">
        <AppHeader />
      </div>
      <div className="relative z-10 flex-1 px-6 py-6 max-w-4xl mx-auto w-full">
        <h1 className="text-2xl font-bold text-text-primary mb-6">Transactions</h1>
        <TransactionList txs={txs} isLoading={isLoading} isError={isError} onRefresh={handleRefresh} isRefreshing={isRefreshing} skeletonCount={5} />
      </div>
      <Footer />
    </main>
  );
}
