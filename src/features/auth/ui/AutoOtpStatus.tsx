"use client";

import type { FormEvent } from "react";

interface Props {
  email: string;
  error?: string | null;
  deviceIdError?: boolean;
  onRetryDeviceId?: () => void;
  onResend: (e: FormEvent) => void;
}

/**
 * Status shown while an OTP code is auto-sent to the session email. Replaces the editable
 * EmailStep in re-auth fallbacks: the email identifies the wallet owner, so letting the
 * user change it here is a footgun (a different email would authenticate a different
 * Circle user whose wallet cannot sign the pending challenge).
 */
export function AutoOtpStatus({ email, error, deviceIdError, onRetryDeviceId, onResend }: Props) {
  const problem = deviceIdError ? "Could not initialize the wallet SDK." : error;
  return (
    <div className="text-center py-2 space-y-2">
      {problem ? (
        <>
          <p className="text-xs text-red-400/80">{problem}</p>
          <button
            onClick={(e) =>
              deviceIdError ? onRetryDeviceId?.() : onResend(e as unknown as FormEvent)
            }
            className="text-xs text-blue-primary/70 hover:text-blue-primary transition-colors"
          >
            Try again
          </button>
        </>
      ) : (
        <span className="shimmer-text text-sm font-medium">
          Sending a code to {email}…
        </span>
      )}
    </div>
  );
}
