"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import BrandHeader from "@/components/BrandHeader";
import Footer from "@/components/Footer";

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
  const [deviceIdError, setDeviceIdError] = useState(false);
  const [deviceIdLoading, setDeviceIdLoading] = useState(true);

  // Keep email accessible inside SDK callbacks without stale closure
  const emailRef = useRef("");

  const circleAppId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID ?? "";
  const [alreadySignedIn, setAlreadySignedIn] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("woosh_session")) {
      setAlreadySignedIn(true);
    }
  }, []);

  useEffect(() => {
    const onLoginComplete = (err: unknown, result: unknown) => {
      if (err) {
        setError("Verification failed. Please try again.");
        setStep("verify");
        return;
      }
      setStep("creating");
      const res = result as LoginResult;
      void handleCreateWallet(res.userToken, res.encryptionKey);
    };

    const sdk = new W3SSdk(
      { appSettings: { appId: circleAppId } },
      onLoginComplete
    );
    sdkRef.current = sdk;

    void sdk.getDeviceId().then((id) => {
      if (id) setDeviceId(id);
      else setDeviceIdError(true);
      setDeviceIdLoading(false);
    }).catch(() => {
      setDeviceIdError(true);
      setDeviceIdLoading(false);
    });
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
      sdkRef.current?.verifyOtp();
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
        body: JSON.stringify({ userToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to complete setup");

      localStorage.setItem(
        "woosh_session",
        JSON.stringify({
          email: emailRef.current,
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

  if (deviceIdLoading) {
    return (
      <main className="min-h-screen bg-navy flex flex-col">
        <BrandHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <Footer />
      </main>
    );
  }

  if (deviceIdError) {
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

  if (alreadySignedIn) {
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
              Go to dashboard →
            </Link>
            <button
              onClick={() => setAlreadySignedIn(false)}
              className="mt-4 block w-full text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Sign up with a different account
            </button>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <BrandHeader />
      <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">

        {step === "email" && (
          <>
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Sign in with email
            </h1>
            <p className="text-text-secondary text-sm mb-8">
              We&apos;ll send you a one-time code. No password needed.
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
                className="w-full bg-blue-primary hover:enabled:bg-blue-secondary disabled:opacity-50 text-white font-semibold py-3 rounded-input transition-colors shadow-glow min-h-[44px]"
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
              We sent a code to{" "}
              <span className="text-text-primary">{email}</span>. Enter it in the window that just opened.
            </p>
            {error && (
              <p className="mb-4 text-sm text-red-400">{error}</p>
            )}
            <button
              onClick={handleVerifyOtp}
              className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-text-secondary hover:text-text-primary font-medium py-3 rounded-input transition-colors min-h-[44px] text-sm"
            >
              Re-open code entry
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
            <h1 className="text-2xl font-bold text-text-primary mb-2 text-center">
              Almost there…
            </h1>
            <p className="text-text-secondary text-sm text-center">
              This takes just a moment.
            </p>
            {error && (
              <p className="mt-4 text-sm text-red-400">{error}</p>
            )}
          </>
        )}
      </div>
      </div>
      <Footer />
    </main>
  );
}
