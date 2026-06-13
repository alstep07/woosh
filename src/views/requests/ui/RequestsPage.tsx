"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BrandHeader from "@/widgets/BrandHeader/ui/BrandHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";
import { Spinner } from "@/shared/ui/Spinner";
import { getSession as loadSession } from "@/shared/lib/session";
import { useRequests } from "@/entities/invoice/hooks/useRequests";
import { computeInvoiceId, newNonce } from "@/entities/invoice/lib/computeInvoiceId";
import { buildRequestLink } from "@/entities/invoice/lib/buildRequestLink";
import type { Session } from "@/entities/user/model/types";

const AMOUNT_RE = /^\d+(\.\d{1,6})?$/;

export default function RequestsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { requests, paid, add, remove } = useRequests();

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/signup"); return; }
    setSession(s);
  }, [router]);

  function createRequest() {
    if (!session) return;
    const a = amount.trim();
    if (!AMOUNT_RE.test(a) || parseFloat(a) <= 0) {
      setError("Enter a valid positive amount");
      return;
    }
    const payee = session.walletAddress;
    const identifier = session.slug ?? payee;
    const nonce = newNonce();
    const id = computeInvoiceId(payee, a, nonce);
    const link = buildRequestLink(identifier, a, nonce);
    add({
      id,
      payee,
      slug: session.slug,
      amount: a,
      nonce,
      memo: memo.trim() || undefined,
      createdAt: Date.now(),
      link,
    });
    setAmount("");
    setMemo("");
    setError(null);
  }

  async function copyLink(id: string, link: string) {
    await navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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
      <div className="flex-1 px-4 sm:px-6 py-8 max-w-2xl mx-auto w-full">
        <Link
          href="/dashboard"
          className="block text-sm text-blue-primary/60 hover:text-blue-primary transition-colors mb-6"
        >
          ← Back to dashboard
        </Link>

        <h1 className="text-2xl font-bold text-text-primary mb-2">Request a payment</h1>
        <p className="text-text-secondary text-sm mb-6">
          Generate a link that can only be paid for the exact amount you set. You&apos;ll
          see it flip to <span className="text-green-400">Paid</span> as soon as it settles on-chain.
        </p>

        {/* Create form */}
        <div className="glass-card rounded-card p-5 space-y-4 mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-text-secondary mb-1.5">
                Amount (USDC)
              </label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(null); }}
                placeholder="0.00"
              />
            </div>
            <div>
              <label htmlFor="memo" className="block text-sm font-medium text-text-secondary mb-1.5">
                Note (optional)
              </label>
              <Input
                id="memo"
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="e.g. Brunch"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button onClick={createRequest}>Create request link</Button>
        </div>

        {/* List */}
        {requests.length === 0 ? (
          <p className="text-text-secondary/60 text-sm text-center py-8">
            No requests yet. Create one above.
          </p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => {
              const isPaid = !!paid[r.id];
              return (
                <div key={r.id} className="glass-card rounded-card p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-text-primary font-semibold">${r.amount}</span>
                      {r.memo && <span className="text-text-secondary text-sm truncate">· {r.memo}</span>}
                    </div>
                    <p className="text-xs text-text-secondary/50 mt-0.5 truncate font-mono">{r.link}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
                      isPaid
                        ? "bg-green-400/10 text-green-400"
                        : "bg-amber-400/10 text-amber-400"
                    }`}
                  >
                    {isPaid ? "Paid" : "Pending"}
                  </span>
                  <button
                    onClick={() => copyLink(r.id, r.link)}
                    className="shrink-0 text-xs text-blue-primary/70 hover:text-blue-primary transition-colors"
                  >
                    {copiedId === r.id ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    className="shrink-0 text-xs text-text-secondary/40 hover:text-red-400 transition-colors"
                    aria-label="Delete request"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}
