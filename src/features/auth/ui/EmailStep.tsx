"use client";

import { FormEvent } from "react";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";

interface Props {
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  loading: boolean;
  deviceIdLoading: boolean;
  deviceIdError: boolean;
  onRetry: () => void;
  error: string | null;
  deviceId: string;
}

export function EmailStep({
  email,
  onEmailChange,
  onSubmit,
  loading,
  deviceIdLoading,
  deviceIdError,
  onRetry,
  error,
  deviceId,
}: Props) {
  const buttonLabel = loading
    ? "Sending code…"
    : deviceIdLoading
    ? "Connecting…"
    : "Send verification code";

  return (
    <>
      <h1 className="text-2xl font-bold text-text-primary mb-2">
        Sign in with email
      </h1>
      <p className="text-text-secondary text-sm mb-8">
        We&apos;ll send you a one-time code.
      </p>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Input
          id="email"
          type="email"
          label="Email address"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="you@example.com"
          disabled={loading}
          error={error}
        />
        {deviceIdError && (
          <p className="text-sm text-red-400">
            Could not connect to wallet service.{" "}
            <button
              type="button"
              onClick={onRetry}
              className="underline hover:text-red-300 transition-colors"
            >
              Try again
            </button>
          </p>
        )}
        <Button type="submit" disabled={loading || deviceIdLoading || !deviceId}>
          {buttonLabel}
        </Button>
      </form>
    </>
  );
}
