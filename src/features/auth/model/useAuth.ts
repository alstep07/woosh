"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import type { OtpTokens } from "@/entities/user/model/types";
import { getW3SSdk, setLoginHandler, fetchDeviceId } from "@/shared/lib/w3s";

export function useAuth(
  circleAppId: string,
  onSuccess: (userToken: string, encryptionKey: string) => void
) {
  // Keep sdkRef pointing to the singleton so consumers (SignupPage) can call
  // sdk.setAuthentication / sdk.execute without going through this hook.
  // Initialized to null — useEffect below sets it client-side to avoid SSR crash
  // (W3SSdk constructor accesses window, which doesn't exist during server render).
  const sdkRef = useRef<W3SSdk | null>(null);

  // onSuccessRef ensures the handler always calls the latest onSuccess closure
  // even though the handler is only registered once in the effect.
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

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
    if (!circleAppId) return;

    let cancelled = false;

    // Update sdkRef to the current singleton
    sdkRef.current = getW3SSdk(circleAppId);

    // Register this page's handler — unregistered on cleanup
    setLoginHandler((err, result) => {
      if (err) {
        setError("Verification failed. Please try again.");
        setStep("verify");
        return;
      }
      const res = result as { userToken: string; encryptionKey: string };
      onSuccessRef.current(res.userToken, res.encryptionKey);
    });

    setDeviceIdLoading(true);
    setDeviceIdError(false);
    void fetchDeviceId(circleAppId).then((id) => {
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
      setLoginHandler(() => {}); // unregister so handler doesn't fire after unmount
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleAppId]);

  function retryDeviceId() {
    if (!circleAppId) return;
    setDeviceIdLoading(true);
    setDeviceIdError(false);
    void fetchDeviceId(circleAppId).then((id) => {
      if (id) {
        setDeviceId(id);
      } else {
        setDeviceIdError(true);
      }
      setDeviceIdLoading(false);
    });
  }

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
      const sdk = getW3SSdk(circleAppId);
      sdk.updateConfigs({
        appSettings: { appId: circleAppId },
        loginConfigs: {
          deviceToken: tokens.deviceToken,
          deviceEncryptionKey: tokens.deviceEncryptionKey,
          otpToken: tokens.otpToken,
        },
      });
      setStep("verify");
      sdk.verifyOtp();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  function verifyOtp() {
    if (!otpTokens) return;
    setError(null);
    getW3SSdk(circleAppId).verifyOtp();
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
