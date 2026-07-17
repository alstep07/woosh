"use client";

import { EmailStep } from "@/features/auth/ui/EmailStep";
import { AutoOtpStatus } from "@/features/auth/ui/AutoOtpStatus";
import type { useAuth } from "@/features/auth/model/useAuth";

interface Props {
  /** The `session.email` known for this user (renders AutoOtpStatus) or undefined
   *  (renders the manual EmailStep form). */
  knownEmail?: string;
  auth: ReturnType<typeof useAuth>;
  onBack: () => void;
  /** Optional line under the title, e.g. "We need to verify you to fund the strategy onchain." */
  intro?: string;
}

/**
 * The "Confirm it's you" auth block: AutoOtpStatus | EmailStep, loading and verify states,
 * and a Back button. Shared by every modal that drives an onchain action through
 * useChallengeFlow (strategies, savings, invoices) so the copy and states stay in sync.
 */
export function ChallengeAuthSteps({ knownEmail, auth, onBack, intro }: Props) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-text-primary">Confirm it&apos;s you</h2>
      {intro && <p className="text-sm text-text-secondary">{intro}</p>}
      {auth.step === "email" && !auth.loading && (
        knownEmail ? (
          <AutoOtpStatus
            email={knownEmail}
            error={auth.error}
            deviceIdError={auth.deviceIdError}
            onRetryDeviceId={auth.retryDeviceId}
            onResend={auth.sendOtp}
          />
        ) : (
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
        )
      )}
      {auth.step === "email" && auth.loading && (
        <div className="text-center py-2">
          <span className="shimmer-text text-sm font-medium">Sending your code…</span>
        </div>
      )}
      {auth.step === "verify" && (
        <div className="text-center py-2 space-y-1">
          <span className="shimmer-text text-sm font-medium">Enter the code in the window that opened.</span>
          <p className="text-xs text-text-secondary/50">Code sent to {auth.email}</p>
          {auth.error && <p className="text-sm text-red-400 mt-2">{auth.error}</p>}
        </div>
      )}
      <button onClick={onBack} className="w-full text-sm text-blue-primary/60 hover:text-blue-primary transition-colors">
        Back
      </button>
    </div>
  );
}
