"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BrandHeader from "@/widgets/BrandHeader/ui/BrandHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";
import { Spinner } from "@/shared/ui/Spinner";
import { EmailStep } from "@/features/auth/ui/EmailStep";
import { useAuth } from "@/features/auth/model/useAuth";
import { env } from "@/shared/config/env";
import {
  getSession as loadSession,
  getPendingTokens,
  clearPendingTokens,
  getCachedTokens,
  clearCachedTokens,
} from "@/shared/lib/session";
import { useMyInvoices } from "@/entities/invoice/hooks/useMyInvoices";
import { newNonce } from "@/entities/invoice/lib/computeInvoiceId";
import { buildRequestLink } from "@/entities/invoice/lib/buildRequestLink";
import type { Session } from "@/entities/user/model/types";

const AMOUNT_RE = /^\d+(\.\d{1,6})?$/;

// "form" — create + list; "auth" — OTP re-auth; "creating" — challenge/PIN in flight
type Phase = "form" | "auth" | "creating";

export default function RequestsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Pending request params, held in a ref so the SDK callback (captured once) reads
  // the latest values across the async OTP/PIN flow.
  const pendingRef = useRef<{ salt: string; amount: string; memo: string } | null>(null);

  const { invoices, loading, refetch } = useMyInvoices(session?.walletAddress);

  // ── useAuth with the stable-callback delegate pattern (see SlugSetupPage) ──────
  const onAuthSuccessRef = useRef<(userToken: string, encryptionKey: string) => void>(() => {});
  const stableOnSuccess = useCallback((userToken: string, encryptionKey: string) => {
    onAuthSuccessRef.current(userToken, encryptionKey);
  }, []);
  const auth = useAuth(env.circleAppId, stableOnSuccess);
  onAuthSuccessRef.current = (userToken: string, encryptionKey: string) => {
    setPhase("creating");
    setError(null);
    void executeCreate(userToken, encryptionKey);
  };

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/signup"); return; }
    setSession(s);
    if (s.email) auth.setEmail(s.email);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function startCreate() {
    const a = amount.trim();
    if (!AMOUNT_RE.test(a) || parseFloat(a) <= 0) {
      setError("Enter a valid positive amount");
      return;
    }
    pendingRef.current = { salt: newNonce(), amount: a, memo: memo.trim() };
    setError(null);

    const tokens = getPendingTokens() ?? getCachedTokens();
    if (tokens) {
      clearPendingTokens();
      setPhase("creating");
      void executeCreate(tokens.userToken, tokens.encryptionKey);
    } else {
      setPhase("auth");
    }
  }

  async function executeCreate(userToken: string, encryptionKey: string) {
    const pending = pendingRef.current;
    const s = sessionRef.current;
    if (!pending || !s) { setPhase("form"); return; }

    try {
      const res = await fetch("/api/wallet/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userToken,
          salt: pending.salt,
          amount: pending.amount,
          memo: pending.memo,
        }),
      });
      const data = (await res.json()) as { challengeId?: string; error?: string };

      if (!res.ok) {
        if (res.status === 401) {
          clearCachedTokens();
          clearPendingTokens();
          setPhase("auth");
          return;
        }
        setError(data.error ?? "Failed to create request");
        setPhase("form");
        return;
      }
      if (!data.challengeId) {
        setError("Unexpected server response. Please try again.");
        setPhase("form");
        return;
      }

      const sdk = auth.sdkRef.current;
      if (!sdk) {
        setError("Wallet SDK not ready. Please refresh and try again.");
        setPhase("form");
        return;
      }

      sdk.setAuthentication({ userToken, encryptionKey });
      sdk.execute(data.challengeId, (err) => {
        if (err) {
          setError("Transaction failed. Please try again.");
          setPhase("form");
          return;
        }
        // Success — reset form, refetch the on-chain list (Arc finalises sub-second).
        setAmount("");
        setMemo("");
        setPhase("form");
        pendingRef.current = null;
        void refetch();
        setTimeout(() => void refetch(), 2000);
      });
    } catch {
      setError("Network error. Please try again.");
      setPhase("form");
    }
  }

  function linkFor(id: `0x${string}`): string {
    const s = sessionRef.current!;
    return buildRequestLink(s.slug ?? s.walletAddress, id);
  }

  async function copyLink(id: `0x${string}`) {
    await navigator.clipboard.writeText(linkFor(id));
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
      <div className="flex-1 px-4 sm:px-6 py-8 max-w-2xl mx-auto w-full">
        <Link
          href="/dashboard"
          className="block text-sm text-blue-primary/60 hover:text-blue-primary transition-colors mb-6"
        >
          Back to dashboard
        </Link>

        <h1 className="text-2xl font-bold text-text-primary mb-2">Invoices</h1>
        <p className="text-text-secondary text-sm mb-6">
          Create an invoice onchain. The amount and note are stored in the contract, so
          whoever opens the link sees exactly what you asked for and can only pay that amount.
        </p>

        {/* Create / re-auth */}
        <div className="glass-card rounded-card p-5 mb-8">
          {phase === "creating" ? (
            <div className="text-center py-4">
              <div className="flex justify-center mb-3"><Spinner size="lg" /></div>
              <p className="text-text-secondary text-sm">
                Creating your invoice… a PIN window will appear to confirm.
              </p>
            </div>
          ) : phase === "auth" ? (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Confirm it&apos;s you to register the invoice onchain.
              </p>
              {auth.step === "email" && !auth.loading && (
                <EmailStep
                  email={auth.email}
                  onEmailChange={auth.setEmail}
                  onSubmit={auth.sendOtp}
                  loading={false}
                  deviceIdLoading={auth.deviceIdLoading}
                  deviceIdError={auth.deviceIdError}
                  onRetry={auth.retryDeviceId}
                  error={auth.error}
                  deviceId={auth.deviceId}
                />
              )}
              {auth.step === "email" && auth.loading && (
                <div className="text-center py-2">
                  <div className="flex justify-center mb-2"><Spinner size="lg" /></div>
                  <p className="text-text-secondary text-sm">Sending your code…</p>
                </div>
              )}
              {auth.step === "verify" && (
                <div className="text-center py-2">
                  <div className="flex justify-center mb-2"><Spinner size="lg" /></div>
                  <p className="text-text-secondary text-sm">
                    Enter the code from <span className="text-text-primary">{auth.email}</span> in the window that opened.
                  </p>
                  {auth.error && <p className="text-sm text-red-400 mt-2">{auth.error}</p>}
                </div>
              )}
              <button
                onClick={() => { setPhase("form"); auth.resetToEmail(); }}
                className="w-full text-sm text-blue-primary/60 hover:text-blue-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="space-y-4">
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
              <Button onClick={startCreate}>Create invoice</Button>
            </div>
          )}
        </div>

        {/* List — read from the contract */}
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-widest mb-3">
          Your invoices
        </h2>
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
            No invoices yet. Create one above.
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
                  <p className="text-xs text-text-secondary/40 mt-0.5 truncate font-mono">{linkFor(inv.id)}</p>
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
    </main>
  );
}
