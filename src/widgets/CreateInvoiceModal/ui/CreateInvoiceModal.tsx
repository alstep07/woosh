"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";
import { ModalSuccess } from "@/shared/ui/ModalSuccess";
import { ModalHeader } from "@/shared/ui/ModalHeader";
import { AmountInput, Field, FIELD_CLS } from "@/shared/ui/Field";
import { ChallengeAuthSteps } from "@/features/auth/ui/ChallengeAuthSteps";
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

  // Auto-send the OTP to the session email when the auth phase starts: the email
  // identifies the wallet owner, so there is nothing for the user to type (a different
  // email would auth a different Circle user). Sent once per auth-phase entry.
  const sendOtpRef = useRef(auth.sendOtp);
  sendOtpRef.current = auth.sendOtp;
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (phase !== "auth") autoSentRef.current = false;
  }, [phase]);
  useEffect(() => {
    if (
      !autoSentRef.current &&
      phase === "auth" &&
      !!session.email &&
      auth.step === "email" &&
      auth.email &&
      auth.deviceId &&
      !auth.loading &&
      !auth.deviceIdLoading
    ) {
      autoSentRef.current = true;
      void sendOtpRef.current({ preventDefault: () => {} } as React.FormEvent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, auth.step, auth.email, auth.deviceId, auth.loading, auth.deviceIdLoading, session.email]);

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
    <Modal onClose={onClose} dismissible={phase !== "creating"} size="md">
        {lastLink ? (
          <ModalSuccess title="Invoice created" body="Share this link to get paid." onClose={onClose} closeLabel="Done">
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
          </ModalSuccess>
        ) : phase === "creating" ? (
          <div className="text-center py-4">
            <span className="shimmer-text text-sm font-medium">Creating your invoice… a PIN window will appear to confirm.</span>
          </div>
        ) : phase === "auth" ? (
          <ChallengeAuthSteps
            knownEmail={session.email}
            auth={auth}
            onBack={() => { setPhase("form"); auth.resetToEmail(); }}
            intro="We need to verify you to register the invoice onchain."
          />
        ) : (
          <div className="space-y-4">
            <ModalHeader
              title="Create invoice"
              subtitle="Share a link to request a fixed amount."
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h4m4 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            />

            <AmountInput
              id="amount"
              label="Amount"
              value={amount}
              onValueChange={(v) => { setAmount(v); setError(null); }}
              suffix="USDC"
              autoFocus
            />
            <Field label="Note (optional)" htmlFor="memo">
              <input
                id="memo"
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="e.g. Brunch"
                className={FIELD_CLS}
              />
            </Field>

            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={startCreate}>Create invoice</Button>
          </div>
        )}
    </Modal>
  );
}
