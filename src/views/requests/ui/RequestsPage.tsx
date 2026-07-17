"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/widgets/AppHeader/ui/AppHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { Button } from "@/shared/ui/Button";
import { PageHeader } from "@/shared/ui/PageHeader";
import { EmptyState } from "@/shared/ui/EmptyState";
import { RefreshButton } from "@/shared/ui/RefreshButton";
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
        <span className="pointer-events-none select-none absolute top-4 right-4 rotate-[-8deg] font-mono text-xs font-bold tracking-[0.14em] text-green-400 border-2 border-green-400 rounded-md px-2 py-0.5">
          PAID
        </span>
      )}

      <div className="mb-4">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-text-secondary/50">Invoice</p>
        <p className="text-sm font-semibold text-text-primary mt-0.5">#{invoiceNumber(inv.id)}</p>
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { invoices, loading, isError, refetch } = useMyInvoices(session?.walletAddress);

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/signup"); return; }
    setSession(s);
  }, [router]);

  async function handleRefresh() {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }

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

  const isEmpty = !loading && !isError && invoices.length === 0;

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <AppHeader />
      {/* Content width: Invoices is a grid-style list page (an unordered, multi-column
          card grid, not a chronological single-column list), so it keeps the wider
          max-w-4xl. Savings and Payments' recurring lists are single-column and use
          max-w-2xl / the two-column list-and-tool layout instead, see PayEntryPage.tsx
          and SavingsPage.tsx for the rest of the width rule. */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto w-full">
        <PageHeader
          title="My invoices"
          className="mb-6"
          action={
            <div className="flex items-center gap-3">
              <RefreshButton onRefresh={handleRefresh} isRefreshing={isRefreshing} />
              {/* Hide the "Create invoice" CTA once we know the list is empty:
                  EmptyState renders its own "Create your first invoice" button below,
                  and showing both at once duplicates the action on screen. */}
              {!isEmpty && (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  Create invoice
                </Button>
              )}
            </div>
          }
        />

        {loading ? (
          // min-h matches the empty/error card below so finishing a load never
          // visibly resizes the section.
          <div className="grid gap-4 sm:grid-cols-2 min-h-[220px]">
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
        ) : isError ? (
          <EmptyState
            glyph="!"
            primary="Couldn't load your invoices."
            secondary="There was a problem reading from the network. Try again in a moment."
            className="glass-card rounded-card p-6 text-center min-h-[220px] flex flex-col items-center justify-center"
          />
        ) : isEmpty ? (
          <EmptyState
            glyph="⎘"
            primary="No invoices yet."
            secondary="Create an invoice and share the link to get paid in USDC."
            cta={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                Create your first invoice
              </Button>
            }
            className="glass-card rounded-card p-6 text-center min-h-[220px] flex flex-col items-center justify-center"
          />
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
