"use client";

import { useState, useCallback, useEffect, useRef, FormEvent } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSendTransaction,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { parseUnits } from "viem";
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import { useUSDCBalance } from "@/hooks/useUSDCBalance";
import OnboardingGuide from "@/components/OnboardingGuide";
import { arcTestnet } from "@/lib/arc";

interface Props {
  recipientAddress: `0x${string}`;
  recipientLabel: string;
}

type TxState = "idle" | "pending" | "success" | "error";
type WooshStep = "email" | "verify" | "paying";

interface OtpTokens {
  deviceToken: string;
  deviceEncryptionKey: string;
  otpToken: string;
}

export default function PaymentForm({ recipientAddress, recipientLabel }: Props) {
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [guide, setGuide] = useState<{ open: false } | { open: true; step: 1 | 2 | 3 }>({ open: false });

  // External wallet state
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [showConnectors, setShowConnectors] = useState(false);

  // Woosh payment state
  const [wooshMode, setWooshMode] = useState(false);
  const [wooshStep, setWooshStep] = useState<WooshStep>("email");
  const [wooshEmail, setWooshEmail] = useState("");
  const [wooshOtpTokens, setWooshOtpTokens] = useState<OtpTokens | null>(null);
  const [wooshError, setWooshError] = useState<string | null>(null);
  const [wooshLoading, setWooshLoading] = useState(false);

  // Circle SDK
  const sdkRef = useRef<W3SSdk | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const circleAppId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID ?? "";

  // Wagmi
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { data: balance } = useUSDCBalance(address);

  const isWrongNetwork = isConnected && chainId !== arcTestnet.id;
  const parsedAmount = parseFloat(amount);
  const amountValid = !isNaN(parsedAmount) && parsedAmount > 0;
  const hasInsufficientBalance =
    isConnected && !isWrongNetwork && amountValid &&
    balance !== undefined && parseFloat(balance.formatted) < parsedAmount;
  const canPay =
    isConnected && !isWrongNetwork && amountValid &&
    !hasInsufficientBalance && txState !== "pending";

  // Initialize Circle SDK when entering Woosh mode
  useEffect(() => {
    if (!wooshMode) return;

    const onLoginComplete = (err: unknown, result: unknown) => {
      if (err) {
        setWooshError("Verification failed. Please try again.");
        setWooshStep("verify");
        return;
      }
      const res = result as { userToken: string; encryptionKey: string };
      void handleWooshPay(res.userToken, res.encryptionKey);
    };

    const sdk = new W3SSdk({ appSettings: { appId: circleAppId } }, onLoginComplete);
    sdkRef.current = sdk;
    void sdk.getDeviceId().then(setDeviceId);

    return () => { sdkRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wooshMode, circleAppId]);

  function validateAmount() {
    if (!amount.trim()) return;
    if (!amountValid) setAmountError("Enter a valid positive amount");
    else setAmountError(null);
  }

  // ── External wallet pay ──
  async function handleExternalPay() {
    if (!canPay) return;
    setTxState("pending");
    setTxError(null);
    try {
      const hash = await sendTransactionAsync({
        to: recipientAddress,
        value: parseUnits(parsedAmount.toString(), 6),
        chainId: arcTestnet.id,
      });
      setTxHash(hash);
      setTxState("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("User rejected") || msg.includes("user rejected") || msg.includes("denied")) {
        setTxState("idle");
      } else {
        setTxError("Transaction failed. Please try again.");
        setTxState("error");
      }
    }
  }

  // ── Woosh pay: Step 1 — request OTP ──
  async function handleWooshSendOtp(e: FormEvent) {
    e.preventDefault();
    if (!wooshEmail.trim() || !deviceId) return;
    if (!amountValid) { setAmountError("Enter a valid amount first"); return; }

    setWooshLoading(true);
    setWooshError(null);
    try {
      const res = await fetch("/api/wallet/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, email: wooshEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send code");

      const tokens = data as OtpTokens;
      setWooshOtpTokens(tokens);
      sdkRef.current?.updateConfigs({
        appSettings: { appId: circleAppId },
        loginConfigs: {
          deviceToken: tokens.deviceToken,
          deviceEncryptionKey: tokens.deviceEncryptionKey,
          otpToken: tokens.otpToken,
        },
      });
      setWooshStep("verify");
    } catch (err) {
      setWooshError(err instanceof Error ? err.message : "Failed to send code.");
    } finally {
      setWooshLoading(false);
    }
  }

  // ── Woosh pay: Step 2 — verify OTP ──
  function handleWooshVerifyOtp() {
    if (!sdkRef.current || !wooshOtpTokens) return;
    setWooshError(null);
    sdkRef.current.verifyOtp();
  }

  // ── Woosh pay: Step 3 — create & execute payment challenge ──
  async function handleWooshPay(userToken: string, encryptionKey: string) {
    setWooshStep("paying");
    setWooshError(null);
    try {
      const res = await fetch("/api/wallet/send-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken, recipientAddress, amount: parsedAmount.toString() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create payment");

      const sdk = sdkRef.current!;
      sdk.setAuthentication({ userToken, encryptionKey });
      sdk.execute(data.challengeId, (err) => {
        if (err) {
          setWooshError("Payment failed. Please try again.");
          setWooshStep("verify");
          return;
        }
        setTxState("success");
      });
    } catch (err) {
      setWooshError(err instanceof Error ? err.message : "Something went wrong.");
      setWooshStep("verify");
    }
  }

  function exitWooshMode() {
    setWooshMode(false);
    setWooshStep("email");
    setWooshError(null);
    setWooshOtpTokens(null);
  }

  const dismissGuide = useCallback(() => setGuide({ open: false }), []);

  // ── Success ──
  if (txState === "success") {
    return (
      <div className="w-full max-w-md bg-card border border-border rounded-card p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center mx-auto mb-4 text-2xl">
          ✓
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">Payment sent!</h2>
        <p className="text-text-secondary text-sm mb-6">
          ${parsedAmount.toFixed(2)} USDC sent to{" "}
          <span className="font-mono">{recipientLabel}</span>.
        </p>
        {txHash && (
          <p className="text-xs text-text-secondary/60 font-mono break-all">{txHash}</p>
        )}
      </div>
    );
  }

  return (
    <>
      {guide.open && <OnboardingGuide initialStep={guide.step} onDismiss={dismissGuide} />}

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-xl font-bold">woosh</span>
          <p className="text-text-secondary text-sm mt-1">
            Pay <span className="text-text-primary font-medium">{recipientLabel}</span>
          </p>
        </div>

        <div className="bg-card border border-border rounded-card p-6 space-y-5">
          {/* Amount */}
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-text-secondary mb-1.5">
              Amount (USDC)
            </label>
            <input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setAmountError(null); }}
              onBlur={validateAmount}
              placeholder="0.00"
              className="w-full bg-navy border border-border rounded-input px-4 py-3 text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-blue-primary transition-colors text-xl font-semibold"
            />
            {amountError && <p className="mt-1.5 text-sm text-red-400">{amountError}</p>}
          </div>

          {/* ── WOOSH MODE ── */}
          {wooshMode ? (
            <div className="space-y-3">
              {wooshStep === "email" && (
                <form onSubmit={handleWooshSendOtp} className="space-y-3">
                  <p className="text-xs text-text-secondary">
                    Enter your Woosh account email to pay from your wallet.
                  </p>
                  <input
                    type="email"
                    value={wooshEmail}
                    onChange={(e) => setWooshEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={wooshLoading}
                    className="w-full bg-navy border border-border rounded-input px-4 py-3 text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-blue-primary transition-colors disabled:opacity-50"
                  />
                  {wooshError && <p className="text-sm text-red-400">{wooshError}</p>}
                  <button
                    type="submit"
                    disabled={wooshLoading || !deviceId}
                    className="w-full bg-blue-primary hover:bg-blue-secondary disabled:opacity-50 text-white font-semibold py-3 rounded-input transition-colors shadow-glow min-h-[44px]"
                  >
                    {wooshLoading ? "Sending code…" : "Send verification code"}
                  </button>
                </form>
              )}

              {wooshStep === "verify" && (
                <div className="space-y-3">
                  <p className="text-xs text-text-secondary">
                    Code sent to <span className="text-text-primary">{wooshEmail}</span>
                  </p>
                  {wooshError && <p className="text-sm text-red-400">{wooshError}</p>}
                  <button
                    onClick={handleWooshVerifyOtp}
                    className="w-full bg-blue-primary hover:bg-blue-secondary text-white font-semibold py-3 rounded-input transition-colors shadow-glow min-h-[44px]"
                  >
                    Enter verification code
                  </button>
                </div>
              )}

              {wooshStep === "paying" && (
                <div className="py-2 text-center">
                  <div className="w-6 h-6 border-2 border-blue-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm text-text-secondary">Processing payment…</p>
                </div>
              )}

              <button
                onClick={exitWooshMode}
                className="w-full text-xs text-text-secondary hover:text-text-primary py-1 transition-colors"
              >
                ← Use a different method
              </button>
            </div>
          ) : isConnected ? (
            /* ── EXTERNAL WALLET CONNECTED ── */
            <div className="space-y-3">
              {isWrongNetwork && (
                <div className="bg-amber-400/10 border border-amber-400/20 rounded-input px-4 py-3 text-sm text-amber-400 flex items-center justify-between gap-3">
                  <span>Switch to Arc Testnet to continue</span>
                  <button
                    onClick={() => switchChain({ chainId: arcTestnet.id })}
                    className="text-xs font-semibold underline whitespace-nowrap"
                  >
                    Switch
                  </button>
                </div>
              )}

              {hasInsufficientBalance && (
                <div className="bg-blue-primary/10 border border-blue-primary/20 rounded-input px-4 py-3 text-sm text-text-secondary flex items-center justify-between gap-3">
                  <span>You need USDC on Arc to pay.</span>
                  <button
                    onClick={() => setGuide({ open: true, step: 2 })}
                    className="text-xs font-semibold text-blue-primary whitespace-nowrap"
                  >
                    Here&apos;s how to get some →
                  </button>
                </div>
              )}

              {txState === "error" && txError && (
                <p className="text-sm text-red-400">{txError}</p>
              )}

              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span className="font-mono">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
                <span>{balance ? `${balance.display} available` : "Loading…"}</span>
              </div>

              <button
                onClick={handleExternalPay}
                disabled={!canPay}
                className="w-full bg-blue-primary hover:bg-blue-secondary disabled:opacity-40 text-white font-semibold py-3 rounded-input transition-colors shadow-glow min-h-[44px]"
              >
                {txState === "pending"
                  ? "Confirm in wallet…"
                  : `Pay $${amountValid ? parsedAmount.toFixed(2) : "0.00"} USDC`}
              </button>

              <button
                onClick={() => disconnect()}
                className="w-full text-xs text-text-secondary hover:text-text-primary py-1 transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            /* ── NOT CONNECTED — two options ── */
            <div className="space-y-2">
              {!showConnectors ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowConnectors(true)}
                    className="bg-card border border-border hover:border-blue-primary text-text-primary font-medium py-3 rounded-input transition-colors min-h-[44px] text-sm"
                  >
                    Connect Wallet
                  </button>
                  <button
                    onClick={() => setWooshMode(true)}
                    className="bg-blue-primary hover:bg-blue-secondary text-white font-semibold py-3 rounded-input transition-colors shadow-glow min-h-[44px] text-sm"
                  >
                    Pay with Woosh
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {connectors.map((connector) => (
                    <button
                      key={connector.uid}
                      onClick={() => { connect({ connector }); setShowConnectors(false); }}
                      className="w-full bg-card border border-border hover:border-blue-primary text-text-primary font-medium py-3 rounded-input transition-colors min-h-[44px] text-sm"
                    >
                      {connector.name}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowConnectors(false)}
                    className="w-full text-xs text-text-secondary hover:text-text-primary py-1 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center mt-6 text-sm text-text-secondary">
          New to digital wallets?{" "}
          <button
            onClick={() => setGuide({ open: true, step: 1 })}
            className="text-blue-primary hover:underline"
          >
            I don&apos;t know where to start
          </button>
        </p>
      </div>
    </>
  );
}
