"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/widgets/AppHeader/ui/AppHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import CreateInvoiceModal from "@/widgets/CreateInvoiceModal/ui/CreateInvoiceModal";
import { getSession as loadSession } from "@/shared/lib/session";
import { useMyInvoices } from "@/entities/invoice/hooks/useMyInvoices";
import { buildRequestLink } from "@/entities/invoice/lib/buildRequestLink";
import type { OnchainInvoice } from "@/entities/invoice/model/types";
import type { Session } from "@/entities/user/model/types";

function short(addr?: string | null): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

function invoiceNumber(id: string): string {
  return `WSH-${id.slice(2, 6).toUpperCase()}`;
}

function issuedDate(unixSeconds: number): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="shrink-0">
      <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 9.5H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** A single invoice rendered as a glass "receipt", echoing the landing-page animation. */
function InvoiceCard({
  inv,
  copied,
  onCopy,
}: {
  inv: OnchainInvoice;
  copied: boolean;
  onCopy: () => void;
}) {
  const issued = issuedDate(inv.createdAt);
  return (
    <div className="relative glass-card rounded-card p-5 overflow-hidden">
      {inv.paid && (
        <span className="pointer-events-none select-none absolute top-4 right-4 rotate-[-8deg] font-mono text-[11px] font-bold tracking-[0.14em] text-green-400 border-2 border-green-400 rounded-md px-2 py-0.5">
          PAID
        </span>
      )}

      <div className="mb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary/50">Invoice</p>
        <p className="text-[13px] font-semibold text-text-primary mt-0.5">#{invoiceNumber(inv.id)}</p>
      </div>

      <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border text-sm">
        <span className="text-text-secondary truncate">{inv.memo || "Payment"}</span>
        <span className="text-text-primary shrink-0">${inv.amount}</span>
      </div>

      {issued && (
        <div className="flex items-center justify-between py-2.5 border-b border-border text-xs">
          <span className="text-text-secondary/50">Issued</span>
          <span className="text-text-secondary/50">{issued}</span>
        </div>
      )}

      <div className="flex items-end justify-between pt-3.5">
        <span className="text-sm font-semibold text-text-primary">Total</span>
        <span className="text-2xl font-bold text-grad leading-none">${inv.amount}</span>
      </div>

      <div className="mt-4 pt-3 border-t border-dashed border-border">
        {inv.paid ? (
          <p className="text-xs text-text-secondary/50">
            Settled{inv.payer ? ` by ${short(inv.payer)}` : ""}
          </p>
        ) : (
          <button
            onClick={onCopy}
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-blue-primary bg-blue-primary/10 hover:bg-blue-primary/20 rounded-input py-2 transition-colors"
          >
            {copied ? "Copied!" : (<><CopyIcon /> Copy payment link</>)}
          </button>
        )}
      </div>
    </div>
  );
}

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
        <span className="shimmer-text text-sm font-medium">Loading…</span>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <AppHeader />
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto w-full">
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
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="glass-card rounded-card p-5 space-y-3">
                <div className="h-3 w-16 bg-border rounded animate-pulse" />
                <div className="h-px w-full bg-border" />
                <div className="flex justify-between">
                  <div className="h-4 w-24 bg-border rounded animate-pulse" />
                  <div className="h-4 w-12 bg-border rounded animate-pulse" />
                </div>
                <div className="flex justify-between items-end pt-2">
                  <div className="h-4 w-12 bg-border rounded animate-pulse" />
                  <div className="h-7 w-20 bg-border rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="glass-card rounded-card py-12 px-6 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-blue-primary/10 text-blue-primary grid place-items-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h4m4 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-text-primary font-semibold">No invoices yet</p>
            <p className="text-text-secondary/60 text-sm mt-1 mb-5 max-w-xs mx-auto">
              Create an invoice and share the link to get paid in USDC.
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              className="bg-blue-primary hover:bg-blue-secondary text-white text-sm font-semibold px-4 py-2 rounded-input transition-colors shadow-glow"
            >
              Create your first invoice
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {invoices.map((inv) => (
              <InvoiceCard
                key={inv.id}
                inv={inv}
                copied={copied === inv.id}
                onCopy={() => copyLink(inv.id)}
              />
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
