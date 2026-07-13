"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";
import { EmailStep } from "@/features/auth/ui/EmailStep";
import { AutoOtpStatus } from "@/features/auth/ui/AutoOtpStatus";
import { useChallengeFlow } from "@/features/auth/model/useChallengeFlow";
import type { Session } from "@/entities/user/model/types";
import type { OnchainStrategy } from "@/entities/strategy/model/types";

const AMOUNT_RE = /^\d+(\.\d{1,6})?$/;

export type StrategyAction = "pause" | "resume" | "cancel" | "fund";

const COPY: Record<StrategyAction, { title: string; body: string; cta: string; glyph: string; cls: string }> = {
  pause: { title: "Pause strategy", body: "It stops running until you resume it. Funds stay in the vault.", cta: "Pause", glyph: "⏸", cls: "bg-amber-400/10 text-amber-400" },
  resume: { title: "Resume strategy", body: "It starts running again on its schedule.", cta: "Resume", glyph: "▶", cls: "bg-green-400/10 text-green-400" },
  cancel: { title: "Cancel strategy", body: "It stops for good and the remaining balance is refunded to you.", cta: "Cancel strategy", glyph: "✕", cls: "bg-red-400/10 text-red-400" },
  fund: { title: "Add funds", body: "Top up the strategy's budget so it can keep running.", cta: "Add funds", glyph: "+", cls: "bg-blue-primary/10 text-blue-primary" },
};

const FIELD_CLS =
  "w-full bg-border/40 text-text-primary rounded-input px-3 py-2.5 text-sm border border-border focus:border-blue-primary outline-none transition-colors placeholder:text-text-secondary/40";

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
    <Modal onClose={onClose} dismissible={flow.phase !== "running"} size="sm">
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
            <span className="shimmer-text text-sm font-medium">Confirming… a PIN window will appear.</span>
          </div>
        ) : flow.phase === "auth" ? (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-text-primary">Confirm it&apos;s you</h2>
            {flow.auth.step === "email" && !flow.auth.loading && (
              session.email ? (
                <AutoOtpStatus
                  email={session.email}
                  error={flow.auth.error}
                  deviceIdError={flow.auth.deviceIdError}
                  onRetryDeviceId={flow.auth.retryDeviceId}
                  onResend={flow.auth.sendOtp}
                />
              ) : (
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
              )
            )}
            {flow.auth.step === "email" && flow.auth.loading && (
              <div className="text-center py-2">
                <span className="shimmer-text text-sm font-medium">Sending your code…</span>
              </div>
            )}
            {flow.auth.step === "verify" && (
              <div className="text-center py-2 space-y-1">
                <span className="shimmer-text text-sm font-medium">Enter the code in the window that opened.</span>
                <p className="text-xs text-text-secondary/50">Code sent to {flow.auth.email}</p>
                {flow.auth.error && <p className="text-sm text-red-400 mt-2">{flow.auth.error}</p>}
              </div>
            )}
            <button onClick={flow.backToIdle} className="w-full text-sm text-blue-primary/60 hover:text-blue-primary transition-colors">Back</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className={`shrink-0 h-9 w-9 rounded-full grid place-items-center text-base font-bold ${copy.cls}`}>
                {copy.glyph}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-text-primary leading-tight">{copy.title}</h2>
                <p className="text-sm text-text-secondary mt-1">{copy.body}</p>
              </div>
            </div>
            {action === "fund" && (
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setFormError(null); }}
                  placeholder="0.00"
                  autoFocus
                  className={`${FIELD_CLS} pr-16`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">USDC</span>
              </div>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={start}>{copy.cta}</Button>
          </div>
        )}
    </Modal>
  );
}
