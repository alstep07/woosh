"use client";

import { Button } from "@/shared/ui/Button";

interface Props {
  email: string;
  error: string | null;
  onVerify: () => void;
  onReset: () => void;
}

export function OtpStep({ email, error, onVerify, onReset }: Props) {
  return (
    <>
      <h1 className="text-2xl font-bold text-text-primary mb-2">
        Check your email
      </h1>
      <p className="text-text-secondary text-sm mb-8">
        We sent a code to{" "}
        <span className="text-text-primary">{email}</span>. Enter it in the window that just opened.
      </p>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      <Button variant="ghost" onClick={onVerify}>
        Re-open code entry
      </Button>
      <button
        onClick={onReset}
        className="mt-3 w-full text-text-secondary text-sm hover:text-text-primary transition-colors"
      >
        Use a different email
      </button>
    </>
  );
}
