"use client";

import { useEffect, useState } from "react";
import { env } from "@/shared/config/env";

type Step = 1 | 2 | 3;

interface Props {
  initialStep?: Step;
  onDismiss: () => void;
}

export default function OnboardingGuide({ initialStep = 1, onDismiss }: Props) {
  const [step, setStep] = useState<Step>(initialStep);

  // Dismiss on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 bg-navy/80 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div className="w-full max-w-md glass-card rounded-card p-6">
        {/* Step indicators + close in one row */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center gap-2 flex-1">
            {([1, 2, 3] as Step[]).map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= step ? "bg-blue-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
          <button
            onClick={onDismiss}
            aria-label="Close"
            className="shrink-0 text-text-secondary hover:text-text-primary leading-none transition-colors"
          >
            ✕
          </button>
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
              You&apos;re on the testnet, so you can get free test USDC from the
              Arc faucet. Visit the faucet, enter your wallet address, and funds
              will arrive in seconds.
            </p>
            <a
              href={env.arcFaucetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-blue-primary hover:bg-blue-secondary text-white text-center font-semibold py-3 rounded-input transition-colors min-h-[44px] flex items-center justify-center"
            >
              Go to faucet
            </a>
            <button
              onClick={() => setStep(3)}
              className="mt-3 w-full text-sm text-text-secondary hover:text-text-primary text-center transition-colors py-2 min-h-[44px]"
            >
              I&apos;ve got USDC →
            </button>
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
