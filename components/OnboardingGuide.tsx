"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ARC_FAUCET_URL } from "@/lib/arc";

type Step = 1 | 2 | 3;

interface Props {
  initialStep?: Step;
  onDismiss: () => void;
}

export default function OnboardingGuide({ initialStep = 1, onDismiss }: Props) {
  const [step, setStep] = useState<Step>(initialStep);
  const [faucetState, setFaucetState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const { address, isConnected } = useAccount();

  // Dismiss on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  async function requestFaucet() {
    if (!isConnected || !address) return;
    setFaucetState("loading");
    try {
      const res = await fetch(ARC_FAUCET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) throw new Error("Faucet error");
      setFaucetState("success");
    } catch {
      setFaucetState("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-navy/80 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div className="w-full max-w-md glass-card rounded-card p-6 relative">
        {/* Close */}
        <button
          onClick={onDismiss}
          aria-label="Close"
          className="absolute top-4 right-4 text-text-secondary hover:text-text-primary text-xl leading-none"
        >
          ✕
        </button>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-6">
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-blue-primary" : "bg-border"
              }`}
            />
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div>
            <p className="text-xs font-semibold text-blue-primary uppercase tracking-widest mb-2">
              Step 1 of 3
            </p>
            <h2 className="text-lg font-bold text-text-primary mb-3">
              Create a Woosh account
            </h2>
            <p className="text-text-secondary text-sm mb-6">
              Sign up with your email and we&apos;ll set up a digital wallet for
              you — no apps to install, no complicated setup.
            </p>
            <a
              href="/signup"
              className="block w-full bg-blue-primary hover:bg-blue-secondary text-white text-center font-semibold py-3 rounded-input transition-colors min-h-[44px] flex items-center justify-center"
            >
              Create my account
            </a>
            <button
              onClick={() => setStep(2)}
              className="mt-3 w-full text-sm text-text-secondary hover:text-text-primary text-center transition-colors py-2 min-h-[44px]"
            >
              I already have an account →
            </button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div>
            <p className="text-xs font-semibold text-blue-primary uppercase tracking-widest mb-2">
              Step 2 of 3
            </p>
            <h2 className="text-lg font-bold text-text-primary mb-3">
              Get USDC to pay
            </h2>
            <p className="text-text-secondary text-sm mb-6">
              You&apos;re on the testnet, so you can get free test USDC instantly
              from the faucet. One click and you&apos;re funded.
            </p>

            {!isConnected ? (
              <p className="text-sm text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-input px-4 py-3 mb-4">
                Connect your wallet on the payment page first, then come back
                here to claim test funds.
              </p>
            ) : faucetState === "success" ? (
              <div className="text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded-input px-4 py-3 mb-4">
                Test USDC sent! It may take a few seconds to appear.
              </div>
            ) : faucetState === "error" ? (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-input px-4 py-3 mb-4">
                Faucet request failed. Try again or visit the Arc faucet directly.
              </p>
            ) : null}

            {isConnected && faucetState !== "success" && (
              <button
                onClick={requestFaucet}
                disabled={faucetState === "loading"}
                className="w-full bg-blue-primary hover:bg-blue-secondary disabled:opacity-50 text-white font-semibold py-3 rounded-input transition-colors min-h-[44px]"
              >
                {faucetState === "loading" ? "Requesting…" : "Get testnet USDC"}
              </button>
            )}

            {(faucetState === "success" || !isConnected) && (
              <button
                onClick={() => setStep(3)}
                className="mt-3 w-full bg-blue-primary hover:bg-blue-secondary text-white font-semibold py-3 rounded-input transition-colors min-h-[44px]"
              >
                Continue →
              </button>
            )}
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div>
            <p className="text-xs font-semibold text-blue-primary uppercase tracking-widest mb-2">
              Step 3 of 3
            </p>
            <h2 className="text-lg font-bold text-text-primary mb-3">
              You&apos;re ready to pay
            </h2>
            <p className="text-text-secondary text-sm mb-6">
              Your wallet is set up and funded. Head back to the payment form to
              complete your payment.
            </p>
            <button
              onClick={onDismiss}
              className="w-full bg-blue-primary hover:bg-blue-secondary text-white font-semibold py-3 rounded-input transition-colors shadow-glow min-h-[44px]"
            >
              Back to payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
