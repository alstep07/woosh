"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";
import { Spinner } from "@/shared/ui/Spinner";
import { EmailStep } from "@/features/auth/ui/EmailStep";
import { useChallengeFlow } from "@/features/auth/model/useChallengeFlow";
import type { Session } from "@/entities/user/model/types";
import type { OnchainStrategy } from "@/entities/strategy/model/types";

const AMOUNT_RE = /^\d+(\.\d{1,6})?$/;

export type StrategyAction = "pause" | "resume" | "cancel" | "fund";

const COPY: Record<StrategyAction, { title: string; body: string; cta: string }> = {
  pause: { title: "Pause strategy", body: "It stops running until you resume it. Funds stay in the vault.", cta: "Pause" },
  resume: { title: "Resume strategy", body: "It starts running again on its schedule.", cta: "Resume" },
  cancel: { title: "Cancel strategy", body: "It stops for good and the remaining balance is refunded to you.", cta: "Cancel strategy" },
  fund: { title: "Add funds", body: "Top up the strategy's budget so it can keep running.", cta: "Add funds" },
};

interface Props {
  session: Session;
  strategy: OnchainStrategy;
  action: StrategyAction;
  onClose: () => void;
  onDone?: () => void;
}

/** Confirm + execute for owner actions on a strategy (pause/resume/cancel/fund). */
export default function StrategyActionModal({ session, strategy, action, onClose, onDone }: Props) {
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const copy = COPY[action];

  const flow = useChallengeFlow({
    prefillEmail: session.email,
    request: (userToken) =>
      action === "fund"
        ? fetch("/api/wallet/fund-strategy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userToken, id: strategy.id, amount: amount.trim() }),
          })
        : fetch("/api/wallet/manage-strategy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userToken, id: strategy.id, action }),
          }),
    onSuccess: () => {
      setDone(true);
      onDone?.();
      setTimeout(() => onDone?.(), 2500);
    },
  });

  function start() {
    if (action === "fund" && (!AMOUNT_RE.test(amount.trim()) || parseFloat(amount) <= 0)) {
      setFormError("Enter a valid amount");
      return;
    }
    setFormError(null);
    flow.start();
  }

  const error = formError ?? flow.error;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
      onClick={() => { if (flow.phase !== "running") onClose(); }}
    >
      <div className="w-full max-w-sm glass-card rounded-card p-6 relative" onClick={(e) => e.stopPropagation()}>
        {flow.phase !== "running" && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 text-text-secondary/40 hover:text-text-primary text-sm transition-colors"
          >
            ✕
          </button>
        )}

        {done ? (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center mx-auto mb-3 text-2xl">✓</div>
            <h2 className="text-lg font-bold text-text-primary mb-1">Done</h2>
            <button onClick={onClose} className="block mx-auto mt-2 text-xs text-text-secondary/50 hover:text-text-secondary transition-colors">
              Close
            </button>
          </div>
        ) : flow.phase === "running" ? (
          <div className="text-center py-4">
            <div className="flex justify-center mb-3"><Spinner size="lg" /></div>
            <p className="text-text-secondary text-sm">Confirming… a PIN window will appear.</p>
          </div>
        ) : flow.phase === "auth" ? (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-text-primary">Confirm it&apos;s you</h2>
            {flow.auth.step === "email" && !flow.auth.loading && (
              <EmailStep
                email={flow.auth.email}
                onEmailChange={flow.auth.setEmail}
                onSubmit={flow.auth.sendOtp}
                loading={false}
                deviceIdLoading={flow.auth.deviceIdLoading}
                deviceIdError={flow.auth.deviceIdError}
                onRetry={flow.auth.retryDeviceId}
                error={flow.auth.error}
                deviceId={flow.auth.deviceId}
              />
            )}
            {flow.auth.step === "email" && flow.auth.loading && (
              <div className="text-center py-2"><div className="flex justify-center mb-2"><Spinner size="lg" /></div><p className="text-text-secondary text-sm">Sending your code…</p></div>
            )}
            {flow.auth.step === "verify" && (
              <div className="text-center py-2">
                <div className="flex justify-center mb-2"><Spinner size="lg" /></div>
                <p className="text-text-secondary text-sm">Enter the code from <span className="text-text-primary">{flow.auth.email}</span> in the window that opened.</p>
                {flow.auth.error && <p className="text-sm text-red-400 mt-2">{flow.auth.error}</p>}
              </div>
            )}
            <button onClick={flow.backToIdle} className="w-full text-sm text-blue-primary/60 hover:text-blue-primary transition-colors">Back</button>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-text-primary">{copy.title}</h2>
            <p className="text-sm text-text-secondary">{copy.body}</p>
            {action === "fund" && (
              <Input
                type="number"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setFormError(null); }}
                placeholder="Amount (USDC)"
                autoFocus
              />
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={start}>{copy.cta}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
