"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BrandHeader from "@/widgets/BrandHeader/ui/BrandHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { Spinner } from "@/shared/ui/Spinner";
import CreateInvoiceModal from "@/widgets/CreateInvoiceModal/ui/CreateInvoiceModal";
import { getSession as loadSession } from "@/shared/lib/session";
import { useMyInvoices } from "@/entities/invoice/hooks/useMyInvoices";
import { buildRequestLink } from "@/entities/invoice/lib/buildRequestLink";
import type { Session } from "@/entities/user/model/types";

export default function RequestsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const { invoices, loading, refetch } = useMyInvoices(session?.walletAddress);

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/signup"); return; }
    setSession(s);
  }, [router]);

  async function copyLink(id: `0x${string}`) {
    await navigator.clipboard.writeText(buildRequestLink(id));
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
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
      <BrandHeader />
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto w-full">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-blue-primary/60 hover:text-blue-primary transition-colors mb-6"
        >
          Dashboard
        </Link>

        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-text-primary">My invoices</h1>
          <button
            onClick={() => setCreateOpen(true)}
            className="shrink-0 bg-blue-primary hover:bg-blue-secondary text-white text-sm font-semibold px-4 py-2 rounded-input transition-colors shadow-glow"
          >
            Create invoice
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass-card rounded-card p-4 flex items-center gap-3">
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-border rounded animate-pulse" />
                  <div className="h-3 w-48 bg-border rounded animate-pulse" />
                </div>
                <div className="h-6 w-16 bg-border rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <p className="text-text-secondary/60 text-sm text-center py-8">
            No invoices yet. Create one to get paid.
          </p>
        ) : (
          <div className="space-y-3">
            {invoices.map((inv) => (
              <div key={inv.id} className="glass-card rounded-card p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary font-semibold">${inv.amount}</span>
                    {inv.memo && <span className="text-text-secondary text-sm truncate">· {inv.memo}</span>}
                  </div>
                  <p className="text-xs text-text-secondary/40 mt-0.5 font-mono">{inv.id.slice(0, 10)}…{inv.id.slice(-8)}</p>
                </div>
                <span
                  className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
                    inv.paid ? "bg-green-400/10 text-green-400" : "bg-amber-400/10 text-amber-400"
                  }`}
                >
                  {inv.paid ? "Paid" : "Pending"}
                </span>
                {!inv.paid && (
                  <button
                    onClick={() => copyLink(inv.id)}
                    className="shrink-0 text-xs text-blue-primary/70 hover:text-blue-primary transition-colors"
                  >
                    {copied === inv.id ? "Copied!" : "Copy"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />

      {createOpen && (
        <CreateInvoiceModal
          session={session}
          onClose={() => setCreateOpen(false)}
          onCreated={refetch}
        />
      )}
    </main>
  );
}
