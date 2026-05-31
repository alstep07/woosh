"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

type Step = "email" | "verify" | "creating";

interface OtpTokens {
  deviceToken: string;
  deviceEncryptionKey: string;
  otpToken: string;
}

interface LoginResult {
  userToken: string;
  encryptionKey: string;
}

export default function SignupPage() {
  const router = useRouter();
  const sdkRef = useRef<W3SSdk | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [email, setEmail] = useState("");
  const [otpTokens, setOtpTokens] = useState<OtpTokens | null>(null);
  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Keep email accessible inside SDK callbacks without stale closure
  const emailRef = useRef("");

  const circleAppId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID ?? "";

  useEffect(() => {
    const onLoginComplete = (err: unknown, result: unknown) => {
      if (err) {
        setError("Verification failed. Please try again.");
        setStep("verify");
        return;
      }
      const res = result as LoginResult;
      void handleCreateWallet(res.userToken, res.encryptionKey);
    };

    const sdk = new W3SSdk(
      { appSettings: { appId: circleAppId } },
      onLoginComplete
    );
    sdkRef.current = sdk;

    void sdk.getDeviceId().then(setDeviceId);
  }, [circleAppId]);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !deviceId) return;

    setLoading(true);
    setError(null);
    emailRef.current = trimmed;

    try {
      const res = await fetch("/api/wallet/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send code");

      const tokens = data as OtpTokens;
      setOtpTokens(tokens);

      sdkRef.current?.updateConfigs({
        appSettings: { appId: circleAppId },
        loginConfigs: {
          deviceToken: tokens.deviceToken,
          deviceEncryptionKey: tokens.deviceEncryptionKey,
          otpToken: tokens.otpToken,
        },
      });

      setStep("verify");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleVerifyOtp() {
    if (!sdkRef.current || !otpTokens) return;
    setError(null);
    sdkRef.current.verifyOtp();
  }

  async function handleCreateWallet(userToken: string, encryptionKey: string) {
    setStep("creating");
    setError(null);

    try {
      const initRes = await fetch("/api/wallet/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error ?? "Initialization failed");

      if (initData.alreadyExists) {
        await completeRegistration(userToken);
        return;
      }

      const sdk = sdkRef.current!;
      sdk.setAuthentication({ userToken, encryptionKey });
      sdk.execute(initData.challengeId, (err) => {
        if (err) {
          setError("Failed to create wallet. Please try again.");
          setStep("verify");
          return;
        }
        void completeRegistration(userToken);
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
      setStep("verify");
    }
  }

  async function completeRegistration(userToken: string) {
    try {
      const res = await fetch("/api/wallet/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken, email: emailRef.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to complete setup");

      localStorage.setItem(
        "woosh_session",
        JSON.stringify({
          email: emailRef.current,
          slug: data.slug,
          walletAddress: data.walletAddress,
        })
      );
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Setup failed. Please try again."
      );
      setStep("verify");
    }
  }

  return (
    <main className="min-h-screen bg-navy flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Link href="/" className="block mb-8 text-xl font-bold text-text-primary">
          woosh
        </Link>

        {step === "email" && (
          <>
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Create your account
            </h1>
            <p className="text-text-secondary text-sm mb-8">
              Enter your email and we&apos;ll send you a verification code.
            </p>
            <form onSubmit={handleSendOtp} noValidate className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                  className="w-full bg-card border border-border rounded-input px-4 py-3 text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-blue-primary transition-colors disabled:opacity-50"
                />
                {error && (
                  <p className="mt-2 text-sm text-red-400">{error}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !deviceId}
                className="w-full bg-blue-primary hover:bg-blue-secondary disabled:opacity-50 text-white font-semibold py-3 rounded-input transition-colors shadow-glow min-h-[44px]"
              >
                {loading ? "Sending code…" : "Send verification code"}
              </button>
            </form>
          </>
        )}

        {step === "verify" && (
          <>
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Check your email
            </h1>
            <p className="text-text-secondary text-sm mb-8">
              We sent a verification code to{" "}
              <span className="text-text-primary">{email}</span>.
            </p>
            {error && (
              <p className="mb-4 text-sm text-red-400">{error}</p>
            )}
            <button
              onClick={handleVerifyOtp}
              className="w-full bg-blue-primary hover:bg-blue-secondary text-white font-semibold py-3 rounded-input transition-colors shadow-glow min-h-[44px]"
            >
              Enter verification code
            </button>
            <button
              onClick={() => {
                setStep("email");
                setError(null);
              }}
              className="mt-3 w-full text-text-secondary text-sm hover:text-text-primary transition-colors"
            >
              Use a different email
            </button>
          </>
        )}

        {step === "creating" && (
          <>
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Setting up your wallet…
            </h1>
            <p className="text-text-secondary text-sm">
              This takes just a moment.
            </p>
            {error && (
              <p className="mt-4 text-sm text-red-400">{error}</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
