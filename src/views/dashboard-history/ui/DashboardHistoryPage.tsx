"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTransactionHistory } from "@/entities/payment/hooks/useTransactionHistory";
import BrandHeader from "@/widgets/BrandHeader/ui/BrandHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import TransactionList from "@/widgets/TransactionList/ui/TransactionList";
import { Spinner } from "@/shared/ui/Spinner";
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
        <Spinner size="lg" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <div className="woosh-bg" aria-hidden="true" />
      <div className="relative z-10">
        <BrandHeader />
      </div>
      <div className="relative z-10 flex-1 px-6 py-6 max-w-4xl mx-auto w-full">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-blue-primary/60 hover:text-blue-primary transition-colors mb-6"
        >
          <span aria-hidden>←</span> Dashboard
        </button>
        <h1 className="text-2xl font-bold text-text-primary mb-6">Transactions</h1>
        <TransactionList txs={txs} isLoading={isLoading} isError={isError} onRefresh={handleRefresh} isRefreshing={isRefreshing} skeletonCount={5} />
      </div>
      <Footer />
    </main>
  );
}
