"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/shared/ui/Button";
import { Spinner } from "@/shared/ui/Spinner";
import { EmailStep } from "@/features/auth/ui/EmailStep";
import { useAuth } from "@/features/auth/model/useAuth";
import { env } from "@/shared/config/env";
import {
  getPendingTokens,
  clearPendingTokens,
  getCachedTokens,
  clearCachedTokens,
} from "@/shared/lib/session";
import { computeInvoiceId, newNonce } from "@/entities/invoice/lib/computeInvoiceId";
import { buildRequestLink } from "@/entities/invoice/lib/buildRequestLink";
import type { Session } from "@/entities/user/model/types";

const AMOUNT_RE = /^\d+(\.\d{1,6})?$/;

const FIELD_CLS =
  "w-full bg-border/40 text-text-primary rounded-input px-3 py-2.5 text-sm border border-border focus:border-blue-primary outline-none transition-colors placeholder:text-text-secondary/40";
const LABEL_CLS = "block text-xs font-medium text-text-secondary mb-1.5";

function shortLink(url: string): string {
  const s = url.replace(/^https?:\/\//, "");
  return s.length > 34 ? `${s.slice(0, 24)}…${s.slice(-8)}` : s;
}

type Phase = "form" | "auth" | "creating";

interface Props {
  session: Session;
  onClose: () => void;
  onCreated?: () => void; // e.g. refetch a list after a new invoice settles
}

/**
 * Create-invoice modal: the full onchain create flow (form -> PIN -> success link),
 * extracted so the dashboard and the My Invoices page can both open it. Mount it only
 * while open (parent renders it conditionally), so the auth/SDK hooks run on demand.
 */
export default function CreateInvoiceModal({ session, onClose, onCreated }: Props) {
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pendingRef = useRef<{ salt: string; amount: string; memo: string } | null>(null);

  // useAuth with the stable-callback delegate pattern (see SlugSetupPage)
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
    if (session.email) auth.setEmail(session.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!pending) { setPhase("form"); return; }

    try {
      const res = await fetch("/api/wallet/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken, salt: pending.salt, amount: pending.amount, memo: pending.memo }),
      });
      const data = (await res.json()) as { challengeId?: string; error?: string };

      if (!res.ok) {
        if (res.status === 401) {
          clearCachedTokens();
          clearPendingTokens();
          setPhase("auth");
          return;
        }
        setError(data.error ?? "Failed to create invoice");
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
        // id is deterministic from (payee, salt): build the link immediately.
        const id = computeInvoiceId(s.walletAddress, pending.salt);
        setLastLink(buildRequestLink(id));
        setAmount("");
        setMemo("");
        setPhase("form");
        pendingRef.current = null;
        onCreated?.();
        setTimeout(() => onCreated?.(), 2000);
      });
    } catch {
      setError("Network error. Please try again.");
      setPhase("form");
    }
  }

  async function copyLastLink() {
    if (!lastLink) return;
    await navigator.clipboard.writeText(lastLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
      onClick={() => { if (phase !== "creating") onClose(); }}
    >
      <div
        className="w-full max-w-md glass-card rounded-card p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {phase !== "creating" && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 text-text-secondary/40 hover:text-text-primary text-sm transition-colors"
          >
            ✕
          </button>
        )}

        {lastLink ? (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center mx-auto mb-3 text-2xl">
              ✓
            </div>
            <h2 className="text-lg font-bold text-text-primary mb-1">Invoice created</h2>
            <p className="text-text-secondary text-sm mb-4">Share this link to get paid.</p>
            <button
              onClick={copyLastLink}
              className="inline-flex items-center gap-1.5 max-w-full text-xs bg-blue-primary/10 hover:bg-blue-primary/20 text-blue-primary px-3 py-1.5 rounded-input font-medium transition-colors"
            >
              {copied ? (
                "Copied!"
              ) : (
                <>
                  <span className="font-mono truncate">{shortLink(lastLink)}</span>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="shrink-0">
                    <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M2.5 9.5H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="block mx-auto mt-3 text-xs text-text-secondary/50 hover:text-text-secondary transition-colors"
            >
              Done
            </button>
          </div>
        ) : phase === "creating" ? (
          <div className="text-center py-4">
            <div className="flex justify-center mb-3"><Spinner size="lg" /></div>
            <p className="text-text-secondary text-sm">
              Creating your invoice… a PIN window will appear to confirm.
            </p>
          </div>
        ) : phase === "auth" ? (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-text-primary">Confirm it&apos;s you</h2>
            <p className="text-sm text-text-secondary">
              We need to verify you to register the invoice onchain.
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
              Back
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="shrink-0 h-9 w-9 rounded-full grid place-items-center bg-blue-primary/10 text-blue-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h4m4 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-text-primary leading-tight">Create invoice</h2>
                <p className="text-sm text-text-secondary mt-1">Share a link to request a fixed amount.</p>
              </div>
            </div>

            <div>
              <label htmlFor="amount" className={LABEL_CLS}>Amount</label>
              <div className="relative">
                <input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError(null); }}
                  placeholder="0.00"
                  autoFocus
                  className={`${FIELD_CLS} pr-16`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">USDC</span>
              </div>
            </div>
            <div>
              <label htmlFor="memo" className={LABEL_CLS}>Note (optional)</label>
              <input
                id="memo"
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="e.g. Brunch"
                className={FIELD_CLS}
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={startCreate}>Create invoice</Button>
          </div>
        )}
      </div>
    </div>
  );
}
