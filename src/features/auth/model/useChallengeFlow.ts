"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/model/useAuth";
import { env } from "@/shared/config/env";
import {
  getPendingTokens,
  clearPendingTokens,
  getCachedTokens,
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

  const onAuthSuccessRef = useRef<(userToken: string, encryptionKey: string) => void>(() => {});
  const stableOnSuccess = useCallback((userToken: string, encryptionKey: string) => {
    onAuthSuccessRef.current(userToken, encryptionKey);
  }, []);
  const auth = useAuth(env.circleAppId, stableOnSuccess);
  onAuthSuccessRef.current = (userToken: string, encryptionKey: string) => {
    setPhase("running");
    setError(null);
    void execute(userToken, encryptionKey);
  };

  useEffect(() => {
    if (opts.prefillEmail) auth.setEmail(opts.prefillEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return { phase, error, setError, auth, start, backToIdle };
}
