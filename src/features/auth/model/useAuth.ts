"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import type { OtpTokens } from "@/entities/user/model/types";

const DEVICE_ID_TIMEOUT_MS = 10_000;

async function fetchDeviceId(sdk: W3SSdk): Promise<string | null> {
  try {
    const id = await Promise.race([
      sdk.getDeviceId(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), DEVICE_ID_TIMEOUT_MS)
      ),
    ]);
    return id ?? null;
  } catch {
    // 403 (region block), timeout, or any other failure — fail immediately
    return null;
  }
}

export function useAuth(
  circleAppId: string,
  onSuccess: (userToken: string, encryptionKey: string) => void
) {
  const sdkRef = useRef<W3SSdk | null>(null);
  const emailRef = useRef("");
  const [deviceId, setDeviceId] = useState("");
  const [email, setEmail] = useState("");
  const [otpTokens, setOtpTokens] = useState<OtpTokens | null>(null);
  const [step, setStep] = useState<"email" | "verify">("email");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deviceIdError, setDeviceIdError] = useState(false);
  const [deviceIdLoading, setDeviceIdLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const onLoginComplete = (err: unknown, result: unknown) => {
      if (err) {
        setError("Verification failed. Please try again.");
        setStep("verify");
        return;
      }
      const res = result as { userToken: string; encryptionKey: string };
      onSuccess(res.userToken, res.encryptionKey);
    };

    const sdk = new W3SSdk({ appSettings: { appId: circleAppId } }, onLoginComplete);
    sdkRef.current = sdk;

    setDeviceIdLoading(true);
    setDeviceIdError(false);
    void fetchDeviceId(sdk).then((id) => {
      if (cancelled) return;
      if (id) {
        setDeviceId(id);
      } else {
        setDeviceIdError(true);
      }
      setDeviceIdLoading(false);
    });

    return () => {
      cancelled = true;
      sdkRef.current = null;
    };
  // onSuccess intentionally excluded — would cause SDK re-init on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleAppId]);

  function retryDeviceId() {
    const sdk = sdkRef.current;
    if (!sdk) return;
    setDeviceIdLoading(true);
    setDeviceIdError(false);
    void fetchDeviceId(sdk).then((id) => {
      if (id) {
        setDeviceId(id);
      } else {
        setDeviceIdError(true);
      }
      setDeviceIdLoading(false);
    });
  }

  // Returns true on success, false on failure (caller should not advance step on false)
  async function sendOtp(e: FormEvent): Promise<boolean> {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !deviceId) return false;
    setLoading(true);
    setError(null);
    emailRef.current = trimmed;
    try {
      const res = await fetch("/api/wallet/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send code");
      const tokens = data as OtpTokens;
      setOtpTokens(tokens);
      sdkRef.current?.updateConfigs({
        appSettings: { appId: circleAppId },
        loginConfigs: {
          deviceToken: tokens.deviceToken,
          deviceEncryptionKey: tokens.deviceEncryptionKey,
          otpToken: tokens.otpToken,
        },
      });
      setStep("verify");
      sdkRef.current?.verifyOtp();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  function verifyOtp() {
    if (!sdkRef.current || !otpTokens) return;
    setError(null);
    sdkRef.current.verifyOtp();
  }

  function resetToEmail() {
    setStep("email");
    setError(null);
  }

  return {
    step,
    email,
    setEmail,
    emailRef,
    sendOtp,
    verifyOtp,
    resetToEmail,
    retryDeviceId,
    loading,
    error,
    deviceId,
    deviceIdError,
    deviceIdLoading,
    sdkRef,
    otpTokens,
  };
}
