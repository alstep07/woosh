"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/features/auth/model/useAuth";
import { env } from "@/shared/config/env";
import {
  getPendingTokens,
  clearPendingTokens,
  getCachedTokens,
  setCachedTokens,
  clearCachedTokens,
} from "@/shared/lib/session";

export type ChallengePhase = "idle" | "auth" | "running";

/**
 * Reusable onchain-action flow: cached/pending tokens -> (email OTP fallback) -> server
 * challenge -> sdk.execute (PIN). Extracted so every strategy action (create, fund,
 * pause, resume, cancel) shares ONE implementation instead of copying the auth + execute
 * boilerplate. Mirrors the proven delegate-ref pattern from CreateInvoiceModal so the SDK,
 * which captures onSuccess once, always reads the latest closure (avoids stale-closure
 * bugs called out in the slug-setup notes).
 *
 * `request` does the fetch to a challenge-creating endpoint with the resolved userToken
 * and returns the raw Response (so we can branch on 401). `onSuccess` runs after the PIN
 * transaction is accepted. Use only inside a component mounted on demand (e.g. a modal),
 * because it mounts useAuth + the W3S SDK.
 */
export function useChallengeFlow(opts: {
  request: (userToken: string) => Promise<Response>;
  onSuccess: () => void;
  prefillEmail?: string;
}) {
  const [phase, setPhase] = useState<ChallengePhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const requestRef = useRef(opts.request);
  requestRef.current = opts.request;
  const onSuccessRef = useRef(opts.onSuccess);
  onSuccessRef.current = opts.onSuccess;

  // Allows the UI to cancel a hanging PIN flow. Any late SDK callback is ignored.
  const cancelledRef = useRef(false);

  const onAuthSuccessRef = useRef<(userToken: string, encryptionKey: string) => void>(() => {});
  const stableOnSuccess = useCallback((userToken: string, encryptionKey: string) => {
    onAuthSuccessRef.current(userToken, encryptionKey);
  }, []);
  const auth = useAuth(env.circleAppId, stableOnSuccess);
  onAuthSuccessRef.current = (userToken: string, encryptionKey: string) => {
    // Cache the freshly-verified session so the NEXT action (another strategy step, an
    // invoice, a payment) skips OTP and goes straight to PIN — same as the chat flow. Without
    // this every strategy action re-prompted for the email code even seconds apart.
    setCachedTokens(userToken, encryptionKey);
    setPhase("running");
    setError(null);
    void execute(userToken, encryptionKey);
  };

  useEffect(() => {
    if (opts.prefillEmail) auth.setEmail(opts.prefillEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-send the OTP when the auth phase starts with a known session email. The email
  // identifies the wallet owner, so there is nothing for the user to type: asking for it
  // again is confusing, and a different email would auth a different Circle user whose
  // wallet cannot sign this challenge. Sent once per auth-phase entry (the ref guard
  // prevents a resend loop if sendOtp fails; the UI offers a manual retry instead).
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
      !!opts.prefillEmail &&
      auth.step === "email" &&
      auth.email &&
      auth.deviceId &&
      !auth.loading &&
      !auth.deviceIdLoading
    ) {
      autoSentRef.current = true;
      void sendOtpRef.current({ preventDefault: () => {} } as FormEvent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, auth.step, auth.email, auth.deviceId, auth.loading, auth.deviceIdLoading, opts.prefillEmail]);

  // Function declaration (hoisted) so onAuthSuccessRef above can reference it at render.
  async function execute(userToken: string, encryptionKey: string) {
    try {
      const res = await requestRef.current(userToken);
      const data = (await res.json()) as { challengeId?: string; error?: string };

      if (!res.ok) {
        if (res.status === 401) {
          clearCachedTokens();
          clearPendingTokens();
          setPhase("auth");
          return;
        }
        setError(data.error ?? "Something went wrong");
        setPhase("idle");
        return;
      }
      if (!data.challengeId) {
        setError("Unexpected server response. Please try again.");
        setPhase("idle");
        return;
      }

      const sdk = auth.sdkRef.current;
      if (!sdk) {
        setError("Wallet SDK not ready. Please refresh and try again.");
        setPhase("idle");
        return;
      }

      sdk.setAuthentication({ userToken, encryptionKey });
      sdk.execute(data.challengeId, (err) => {
        if (cancelledRef.current) { cancelledRef.current = false; return; }
        if (err) {
          setError("Transaction failed. Please try again.");
          setPhase("idle");
          return;
        }
        setPhase("idle");
        onSuccessRef.current();
      });
    } catch {
      setError("Network error. Please try again.");
      setPhase("idle");
    }
  }

  // Kick off the flow: try cached tokens first, else fall back to email OTP.
  function start() {
    cancelledRef.current = false;
    setError(null);
    const tokens = getPendingTokens() ?? getCachedTokens();
    if (tokens) {
      clearPendingTokens();
      setPhase("running");
      void execute(tokens.userToken, tokens.encryptionKey);
    } else {
      setPhase("auth");
    }
  }

  function backToIdle() {
    setPhase("idle");
    auth.resetToEmail();
  }

  // Let the user escape a frozen PIN window. Any late SDK callback is ignored.
  function cancel() {
    cancelledRef.current = true;
    setPhase("idle");
    setError(null);
  }

  return { phase, error, setError, auth, start, backToIdle, cancel };
}
