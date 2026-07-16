"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";
import { ModalSuccess } from "@/shared/ui/ModalSuccess";
import { ModalHeader } from "@/shared/ui/ModalHeader";
import { AmountInput } from "@/shared/ui/Field";
import { ChallengeAuthSteps } from "@/features/auth/ui/ChallengeAuthSteps";
import { useChallengeFlow } from "@/features/auth/model/useChallengeFlow";
import type { Session } from "@/entities/user/model/types";
import type { OnchainStrategy } from "@/entities/strategy/model/types";

const AMOUNT_RE = /^\d+(\.\d{1,6})?$/;

export type StrategyAction = "pause" | "resume" | "cancel" | "fund";

function copyFor(noun: string): Record<StrategyAction, { title: string; body: string; cta: string; glyph: string; cls: string }> {
  return {
    pause: { title: `Pause ${noun}`, body: "It stops running until you resume it. Funds stay in the vault.", cta: "Pause", glyph: "⏸", cls: "bg-amber-400/10 text-amber-400" },
    resume: { title: `Resume ${noun}`, body: "It starts running again on its schedule.", cta: "Resume", glyph: "▶", cls: "bg-green-400/10 text-green-400" },
    cancel: { title: `Cancel ${noun}`, body: "It stops for good and the remaining balance is refunded to you.", cta: `Cancel ${noun}`, glyph: "✕", cls: "bg-red-400/10 text-red-400" },
    fund: { title: "Add funds", body: `Top up the ${noun}'s budget so it can keep running.`, cta: "Add funds", glyph: "+", cls: "bg-blue-primary/10 text-blue-primary" },
  };
}

interface Props {
  session: Session;
  strategy: OnchainStrategy;
  action: StrategyAction;
  onClose: () => void;
  onDone?: () => void;
  /** What to call it in the confirmation copy, e.g. "strategy" or "savings". */
  noun?: string;
}

/** Confirm + execute for owner actions on a strategy (pause/resume/cancel/fund). */
export default function StrategyActionModal({ session, strategy, action, onClose, onDone, noun = "automation" }: Props) {
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const copy = copyFor(noun)[action];

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
          <ModalSuccess title="Done" onClose={onClose} />
        ) : flow.phase === "running" ? (
          <div className="text-center py-4">
            <span className="shimmer-text text-sm font-medium">Confirming… a PIN window will appear.</span>
          </div>
        ) : flow.phase === "auth" ? (
          <ChallengeAuthSteps knownEmail={session.email} auth={flow.auth} onBack={flow.backToIdle} />
        ) : (
          <div className="space-y-4">
            <ModalHeader title={copy.title} subtitle={copy.body} icon={copy.glyph} iconClassName={copy.cls} />
            {action === "fund" && (
              <AmountInput
                id="fund-amount"
                label="Amount"
                value={amount}
                onValueChange={(v) => { setAmount(v); setFormError(null); }}
                suffix="USDC"
                autoFocus
              />
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={start}>{copy.cta}</Button>
          </div>
        )}
    </Modal>
  );
}
