"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";
import { ModalHeader } from "@/shared/ui/ModalHeader";
import { ModalSuccess } from "@/shared/ui/ModalSuccess";
import { ChallengeAuthSteps } from "@/features/auth/ui/ChallengeAuthSteps";
import { useChallengeFlow } from "@/features/auth/model/useChallengeFlow";
import type { Session } from "@/entities/user/model/types";

interface Props {
  session: Session;
  icon?: ReactNode;
  iconClassName?: string;
  title: string;
  subtitle?: ReactNode;
  /** Read-only recap shown above the Confirm button, e.g. "Send 30 USDC to 3 people". */
  summary?: ReactNode;
  cta?: string;
  runningLabel?: string;
  authIntro?: string;
  successTitle?: string;
  successBody?: ReactNode;
  request: (userToken: string) => Promise<Response>;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Generic "recap -> confirm -> PIN -> done" modal wrapping useChallengeFlow,
 * ChallengeAuthSteps and ModalSuccess. Extracted from CreateStrategyModal /
 * StrategyActionModal so Send's batch-send/recurring-payment/payroll actions and Swap's
 * recurring auto-buy share one phase switch instead of re-deriving it per form. Every
 * mutating action in the app goes through useChallengeFlow; this is just the shared shell
 * around it.
 */
export function ConfirmActionModal({
  session,
  icon,
  iconClassName,
  title,
  subtitle,
  summary,
  cta = "Confirm",
  runningLabel = "Confirming… a PIN window will appear.",
  authIntro,
  successTitle = "Done",
  successBody,
  request,
  onClose,
  onSuccess,
}: Props) {
  const [done, setDone] = useState(false);

  const flow = useChallengeFlow({
    prefillEmail: session.email,
    request,
    onSuccess: () => {
      setDone(true);
      onSuccess?.();
    },
  });

  return (
    <Modal onClose={onClose} dismissible={flow.phase !== "running"} size="md">
      {done ? (
        <ModalSuccess title={successTitle} body={successBody} onClose={onClose} closeLabel="Done" />
      ) : flow.phase === "running" ? (
        <div className="text-center py-4">
          <span className="shimmer-text text-sm font-medium">{runningLabel}</span>
        </div>
      ) : flow.phase === "auth" ? (
        <ChallengeAuthSteps knownEmail={session.email} auth={flow.auth} onBack={flow.backToIdle} intro={authIntro} />
      ) : (
        <div className="space-y-5">
          <ModalHeader title={title} subtitle={subtitle} icon={icon} iconClassName={iconClassName} />
          {summary}
          {flow.error && <p className="text-sm text-red-400">{flow.error}</p>}
          <Button onClick={flow.start}>{cta}</Button>
        </div>
      )}
    </Modal>
  );
}
