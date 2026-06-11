"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BrandHeader from "@/widgets/BrandHeader/ui/BrandHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { EmailStep } from "@/features/auth/ui/EmailStep";
import { Spinner } from "@/shared/ui/Spinner";
import { useAuth } from "@/features/auth/model/useAuth";
import { env } from "@/shared/config/env";
import { lookupAddressSlug } from "@/entities/slug/lib/lookupAddressSlug";
import { setCachedTokens, setPendingTokens, setSession, clearAll } from "@/shared/lib/session";

// Local wallet-creation lifecycle — separate from OTP auth lifecycle in useAuth
type WalletPhase = "idle" | "creating" | "error";

// Derived step — computed from auth state + walletPhase on every render.
// Single source of truth: no manual synchronization between states.
type Step =
  | "deviceLoading"   // SDK initializing, waiting for deviceId
  | "deviceError"     // deviceId failed (region block / network)
  | "alreadySignedIn" // session exists in localStorage
  | "email"           // email input form
  | "sending"         // OTP being sent to email
  | "verifying"       // OTP popup open, user entering code
  | "creating"        // wallet being created/initialized
  | "createError";    // wallet creation failed

export default function SignupPage() {
  const router = useRouter();
  const [alreadySignedIn, setAlreadySignedIn] = useState(false);
  const [walletPhase, setWalletPhase] = useState<WalletPhase>("idle");
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem("woosh_session")) setAlreadySignedIn(true); // session module reads same key
  }, []);

  const onAuthSuccess = (userToken: string, encryptionKey: string) => {
    setPendingTokens(userToken, encryptionKey); // for /slug-setup to skip re-auth
    setCachedTokens(userToken, encryptionKey);  // for ChatPanel to skip OTP on first payment
    setWalletPhase("creating");
    void createWallet(userToken, encryptionKey);
  };

  const auth = useAuth(env.circleAppId, onAuthSuccess);

  function getStep(): Step {
    if (auth.deviceIdLoading) return "deviceLoading";
    if (auth.deviceIdError)   return "deviceError";
    if (alreadySignedIn)      return "alreadySignedIn";
    if (walletPhase === "creating") return "creating";
    if (walletPhase === "error")    return "createError";
    if (auth.step === "verify")     return "verifying";
    if (auth.loading)               return "sending";
    return "email";
  }

  const step = getStep();

  async function createWallet(userToken: string, encryptionKey: string) {
    try {
      const res = await fetch("/api/wallet/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Initialization failed");

      if (data.alreadyExists) {
        await finishSetup(userToken);
        return;
      }

      const sdk = auth.sdkRef.current!;
      sdk.setAuthentication({ userToken, encryptionKey });
      sdk.execute(data.challengeId, (err) => {
        if (err) {
          setWalletError("Failed to create wallet. Please try again.");
          setWalletPhase("error");
          return;
        }
        void finishSetup(userToken);
      });
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setWalletPhase("error");
    }
  }

  async function finishSetup(userToken: string) {
    try {
      const res = await fetch("/api/wallet/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to complete setup");

      let slug: string | null = null;
      try {
        slug = await lookupAddressSlug(data.walletAddress as `0x${string}`);
      } catch { /* RPC failure — fail open, never block the user */ }

      setSession({
        email: auth.emailRef.current,
        walletAddress: data.walletAddress,
        ...(slug ? { slug } : {}),
      });

      router.push("/dashboard");
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Setup failed. Please try again.");
      setWalletPhase("error");
    }
  }

  function resetToEmail() {
    setWalletPhase("idle");
    setWalletError(null);
    auth.resetToEmail();
  }

  // ── Full-page states ──────────────────────────────────────────────────────

  if (step === "deviceLoading") {
    return (
      <main className="min-h-screen bg-navy flex flex-col">
        <BrandHeader />
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
        <Footer />
      </main>
    );
  }

  if (step === "deviceError") {
    return (
      <main className="min-h-screen bg-navy flex flex-col">
        <BrandHeader />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-md">
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Service not available in your region
            </h1>
            <p className="text-text-secondary text-sm">
              We&apos;re sorry. Woosh relies on Circle&apos;s wallet infrastructure,
              which is currently unavailable in your country due to regulatory restrictions.
            </p>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  if (step === "alreadySignedIn") {
    return (
      <main className="min-h-screen bg-navy flex flex-col">
        <BrandHeader />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-md text-center">
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              You&apos;re already signed in
            </h1>
            <p className="text-text-secondary text-sm mb-8">
              Head to your dashboard to see your balance and payment link.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center bg-blue-primary hover:bg-blue-secondary text-white font-semibold px-8 py-3 rounded-input transition-colors shadow-glow min-h-[44px]"
            >
              Go to dashboard
            </Link>
            <button
              onClick={() => {
                clearAll();
                setAlreadySignedIn(false);
              }}
              className="mt-4 block w-full text-sm text-blue-primary/60 hover:text-blue-primary transition-colors"
            >
              Sign up with a different account
            </button>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  // ── Main flow ─────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <BrandHeader />
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-md">

          {step === "email" && (
            <EmailStep
              email={auth.email}
              onEmailChange={auth.setEmail}
              onSubmit={auth.sendOtp}
              loading={false}
              deviceIdLoading={false}
              deviceIdError={false}
              onRetry={auth.retryDeviceId}
              error={auth.error}
              deviceId={auth.deviceId}
            />
          )}

          {step === "sending" && (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <Spinner size="lg" />
              </div>
              <h1 className="text-2xl font-bold text-text-primary mb-2">
                Sending your code…
              </h1>
              <p className="text-text-secondary text-sm">
                We&apos;re sending a verification code to{" "}
                <span className="text-text-primary">{auth.email}</span>
              </p>
            </div>
          )}

          {step === "verifying" && (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <Spinner size="lg" />
              </div>
              <h1 className="text-2xl font-bold text-text-primary mb-2">
                Verifying your identity…
              </h1>
              <p className="text-text-secondary text-sm mb-8">
                Enter the code from{" "}
                <span className="text-text-primary">{auth.email}</span>{" "}
                in the window that just opened.
              </p>
              {auth.error && (
                <p className="mb-4 text-sm text-red-400">{auth.error}</p>
              )}
              <button
                onClick={auth.verifyOtp}
                className="text-sm text-blue-primary/60 hover:text-blue-primary transition-colors underline"
              >
                Didn&apos;t open? Re-open verification window
              </button>
              <button
                onClick={resetToEmail}
                className="mt-3 block w-full text-sm text-blue-primary/60 hover:text-blue-primary transition-colors"
              >
                Use a different email
              </button>
            </div>
          )}

          {step === "creating" && (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <Spinner size="lg" />
              </div>
              <h1 className="text-2xl font-bold text-text-primary mb-2">
                Preparing your wallet…
              </h1>
              <p className="text-text-secondary text-sm">
                This takes just a moment.
              </p>
            </div>
          )}

          {step === "createError" && (
            <div className="text-center">
              <h1 className="text-2xl font-bold text-text-primary mb-2">
                Something went wrong
              </h1>
              <p className="text-sm text-red-400 mb-6">{walletError}</p>
              <button
                onClick={resetToEmail}
                className="text-sm text-blue-primary/60 hover:text-blue-primary transition-colors underline"
              >
                Try again
              </button>
            </div>
          )}

        </div>
      </div>
      <Footer />
    </main>
  );
}
