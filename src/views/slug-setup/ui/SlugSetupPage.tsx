"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BrandHeader from "@/widgets/BrandHeader/ui/BrandHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";
import { Spinner } from "@/shared/ui/Spinner";
import { EmailStep } from "@/features/auth/ui/EmailStep";
import { useAuth } from "@/features/auth/model/useAuth";
import { useSlugAvailability } from "@/entities/slug/hooks/useSlugAvailability";
import { useUSDCBalance } from "@/entities/wallet/hooks/useUSDCBalance";
import { normalizeSlug } from "@/entities/slug/lib/normalizeSlug";
import { suggestSlugs } from "@/entities/slug/lib/suggestSlugs";
import { env } from "@/shared/config/env";
import { getSession as loadSession, setSession as saveSession, getPendingTokens, clearPendingTokens, getCachedTokens, clearCachedTokens } from "@/shared/lib/session";
import type { Session } from "@/entities/user/model/types";

// Page-level lifecycle phases
type Phase =
  | "loading"       // reading localStorage, redirecting if no session
  | "slug"          // user picks their username
  | "auth"          // email OTP re-auth (re-auth required to sign tx)
  | "registering"   // contract tx in progress (API + SDK challenge)
  | "regError";     // tx failed — show error, allow retry from slug step

export default function SlugSetupPage() {
  const router = useRouter();

  // Session — loaded from localStorage on mount
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  // Slug input + availability
  const [slug, setSlug] = useState("");
  const slugRef = useRef("");
  slugRef.current = slug;

  const [phase, setPhase] = useState<Phase>("loading");
  const [regError, setRegError] = useState<string | null>(null);

  // ── Stale-closure fix for useAuth callback ───────────────────────────────
  // useAuth captures onSuccess once at SDK init. We give it a stable wrapper
  // that delegates to a ref, so the callback always sees the latest state.
  const onAuthSuccessRef = useRef<(userToken: string, encryptionKey: string) => void>(
    () => console.warn("[slug-setup] onAuthSuccess called before ref was assigned")
  );

  const stableOnSuccess = useCallback((userToken: string, encryptionKey: string) => {
    onAuthSuccessRef.current(userToken, encryptionKey);
  }, []); // stable for SDK lifetime

  const auth = useAuth(env.circleAppId, stableOnSuccess);

  // Keep ref in sync with latest closure on every render
  onAuthSuccessRef.current = (userToken: string, encryptionKey: string) => {
    // Transition to registering SYNCHRONOUSLY before any async work — no flash
    setPhase("registering");
    setRegError(null);
    void registerSlug(userToken, encryptionKey);
  };

  // ── Session bootstrap ─────────────────────────────────────────────────────
  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/signup"); return; }
    setSession(s);
    if (s.email) {
      const defaultSlug = normalizeSlug(s.email.split("@")[0]);
      setSlug(defaultSlug);
      slugRef.current = defaultSlug;
      auth.setEmail(s.email);
    }
    setPhase("slug");
  // auth.setEmail is a stable useState setter; router is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const availability = useSlugAvailability(slug);
  const balance = useUSDCBalance(session?.walletAddress as `0x${string}` | undefined);
  const hasNoFunds = balance.data?.raw === 0n;
  const [addressCopied, setAddressCopied] = useState(false);

  async function copyWalletAddress() {
    if (!session?.walletAddress) return;
    await navigator.clipboard.writeText(session.walletAddress);
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSubmitSlug() {
    if (availability !== "available" && availability !== "error") return;

    // Skip re-auth if we have a fresh signup token (pending) or a recent payment token (session)
    const pending = getPendingTokens();
    const tokens = pending ?? getCachedTokens();
    if (tokens) {
      if (pending) clearPendingTokens(); // always consume pending; keep session token
      setPhase("registering");
      setRegError(null);
      await registerSlug(tokens.userToken, tokens.encryptionKey);
    } else {
      setPhase("auth");
    }
  }

  async function registerSlug(userToken: string, encryptionKey: string) {
    const currentSlug = slugRef.current;
    const currentSession = sessionRef.current;

    try {
      const res = await fetch("/api/slug/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken, slug: currentSlug }),
      });
      const data = await res.json() as { challengeId?: string; error?: string };

      if (!res.ok) {
        if (res.status === 401) {
          // Cached token expired — clear it and fall back to OTP re-auth
          clearCachedTokens();
          clearPendingTokens();
          setPhase("auth");
          return;
        }
        setRegError(data.error ?? "Failed to start registration");
        setPhase("regError");
        return;
      }
      if (!data.challengeId) {
        setRegError("Unexpected server response. Please try again.");
        setPhase("regError");
        return;
      }

      const sdk = auth.sdkRef.current;
      if (!sdk) {
        setRegError("Wallet SDK not ready. Please refresh and try again.");
        setPhase("regError");
        return;
      }

      sdk.setAuthentication({ userToken, encryptionKey });
      sdk.execute(data.challengeId, (err) => {
        if (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const isTaken = msg.toLowerCase().includes("taken") || msg.toLowerCase().includes("already");
          setRegError(isTaken
            ? "This username was just claimed. Please choose a different one."
            : "Transaction failed. Please try again."
          );
          setPhase("regError");
          return;
        }

        const updated: Session = { ...currentSession!, slug: currentSlug };
        saveSession(updated);
        router.push("/dashboard");
      });
    } catch {
      setRegError("Network error. Please try again.");
      setPhase("regError");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <main className="min-h-screen bg-navy flex items-center justify-center">
        <Spinner size="lg" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <BrandHeader />
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-md">

          {/* ── Pick slug ─────────────────────────────────────────────────── */}
          {(phase === "slug" || phase === "regError") && (
            <>
              <Link
                href="/dashboard"
                className="block w-full text-sm text-blue-primary/60 hover:text-blue-primary transition-colors mb-6"
              >
                Back to dashboard
              </Link>
              <h1 className="text-2xl font-bold text-text-primary mb-2">
                Choose your payment link
              </h1>
              <p className="text-text-secondary text-sm mb-8">
                Your link will be{" "}
                <span className="text-text-primary font-mono">
                  {env.baseUrl}/pay/{slug || "yourname"}
                </span>
              </p>

              {hasNoFunds && (
                <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                  <span className="mt-0.5 text-amber-400">⚠</span>
                  <div className="flex-1 text-sm">
                    <p className="text-amber-300 font-medium mb-1">You need a small amount of USDC for gas</p>
                    <p className="text-amber-400/80 mb-2">
                      Registering your username is an onchain transaction. Paste your wallet address into the faucet to get testnet USDC.
                    </p>
                    {session?.walletAddress && (
                      <div className="flex items-center gap-2 mb-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                        <span className="font-mono text-xs text-amber-200 flex-1 break-all">
                          {session.walletAddress}
                        </span>
                        <button
                          onClick={copyWalletAddress}
                          className="shrink-0 text-xs text-amber-300 hover:text-amber-200 transition-colors"
                        >
                          {addressCopied ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    )}
                    <a
                      href={env.arcFaucetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 underline underline-offset-2 transition-colors"
                    >
                      Open faucet
                    </a>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {regError && <p className="text-sm text-red-400">{regError}</p>}

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="slug" className="text-sm font-medium text-text-secondary">
                      Your username
                    </label>
                    <span className="text-xs h-4 flex items-center">
                      {availability === "checking" && (
                        <span className="flex items-center gap-1 text-text-secondary">
                          <Spinner size="sm" /> Checking…
                        </span>
                      )}
                      {availability === "available" && (
                        <span className="text-green-400">✓ Available</span>
                      )}
                      {availability === "taken" && (
                        <span className="text-red-400">Already taken</span>
                      )}
                      {availability === "invalid" && (
                        <span className="text-red-400">Invalid format</span>
                      )}
                    </span>
                  </div>
                  <Input
                    id="slug"
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value.toLowerCase());
                      setRegError(null);
                    }}
                    placeholder="yourname"
                  />
                </div>

                {availability === "taken" && (
                  <div>
                    <p className="text-xs text-text-secondary mb-2">Try one of these:</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestSlugs(slug).map((s) => (
                        <button
                          key={s}
                          onClick={() => { setSlug(s); setRegError(null); }}
                          className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:border-blue-primary text-text-secondary hover:text-text-primary transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleSubmitSlug}
                  disabled={
                    availability === "invalid" ||
                    availability === "taken" ||
                    availability === "idle" ||
                    availability === "checking"
                  }
                >
                  Continue
                </Button>
              </div>
            </>
          )}

          {/* ── Re-auth: verify identity ───────────────────────────────────── */}
          {phase === "auth" && (
            <>
              <h1 className="text-2xl font-bold text-text-primary mb-2">
                Confirm your identity
              </h1>
              <p className="text-text-secondary text-sm mb-8">
                To register{" "}
                <span className="text-text-primary font-mono">{env.baseUrl}/pay/{slug}</span>{" "}
                on the blockchain, we need to verify it&apos;s you.
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
                <div className="text-center">
                  <div className="flex justify-center mb-4">
                    <Spinner size="lg" />
                  </div>
                  <h2 className="text-xl font-bold text-text-primary mb-2">
                    Sending your code…
                  </h2>
                  <p className="text-text-secondary text-sm">
                    We&apos;re sending a code to{" "}
                    <span className="text-text-primary">{auth.email}</span>
                  </p>
                </div>
              )}

              {auth.step === "verify" && (
                <div className="text-center">
                  <div className="flex justify-center mb-4">
                    <Spinner size="lg" />
                  </div>
                  <h2 className="text-xl font-bold text-text-primary mb-2">
                    Verifying your identity…
                  </h2>
                  <p className="text-text-secondary text-sm mb-6">
                    Enter the code from{" "}
                    <span className="text-text-primary">{auth.email}</span>{" "}
                    in the window that opened.
                  </p>
                  {auth.error && (
                    <p className="mb-4 text-sm text-red-400">{auth.error}</p>
                  )}
                  <button
                    onClick={auth.verifyOtp}
                    className="text-sm text-blue-primary/60 hover:text-blue-primary transition-colors underline"
                  >
                    Didn&apos;t open? Re-open window
                  </button>
                  <button
                    onClick={() => auth.resetToEmail()}
                    className="mt-3 block w-full text-sm text-blue-primary/60 hover:text-blue-primary transition-colors"
                  >
                    Use a different email
                  </button>
                </div>
              )}

              <button
                onClick={() => { setPhase("slug"); setRegError(null); }}
                className="mt-4 w-full text-sm text-blue-primary/60 hover:text-blue-primary transition-colors"
              >
                Back to link selection
              </button>
            </>
          )}

          {/* ── Registering onchain ────────────────────────────────────────── */}
          {phase === "registering" && (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <Spinner size="lg" />
              </div>
              <h1 className="text-2xl font-bold text-text-primary mb-2">
                Registering your link…
              </h1>
              <p className="text-text-secondary text-sm">
                A PIN window will appear — enter your Woosh PIN to confirm.
              </p>
            </div>
          )}

        </div>
      </div>
      <Footer />
    </main>
  );
}
