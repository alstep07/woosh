"use client";

import { useRef, useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";
import { Spinner } from "@/shared/ui/Spinner";
import { EmailStep } from "@/features/auth/ui/EmailStep";
import { useChallengeFlow } from "@/features/auth/model/useChallengeFlow";
import { computeStrategyId, newStrategySalt } from "@/entities/strategy/lib/computeStrategyId";
import { INTERVAL_PRESETS } from "@/entities/strategy/lib/format";
import { SWAP_TARGETS } from "@/shared/lib/tokens";
import type { Session } from "@/entities/user/model/types";

const AMOUNT_RE = /^\d+(\.\d{1,6})?$/;

type Kind = "payment" | "swap";

interface Props {
  session: Session;
  onClose: () => void;
  onCreated?: () => void;
}

/**
 * Create-strategy modal: recurring USDC payments or DCA auto-buys. Form -> PIN -> done.
 * Funds the onchain vault (WooshStrategyRegistry.create) with the starting budget; the
 * cron executor runs it on schedule afterwards. Reuses useChallengeFlow for the auth/PIN.
 */
export default function CreateStrategyModal({ session, onClose, onCreated }: Props) {
  const swapTargets = SWAP_TARGETS.filter((t) => t.address);

  const [kind, setKind] = useState<Kind>("payment");
  const [recipient, setRecipient] = useState("");
  const [tokenOut, setTokenOut] = useState<string>(swapTargets[0]?.address ?? "");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState(INTERVAL_PRESETS[0].seconds);
  const [periods, setPeriods] = useState("");
  const [funding, setFunding] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const saltRef = useRef<string>("");

  const flow = useChallengeFlow({
    prefillEmail: session.email,
    request: (userToken) =>
      fetch("/api/wallet/create-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userToken,
          salt: saltRef.current,
          kind,
          recipient: kind === "payment" ? recipient.trim() : undefined,
          tokenOut: kind === "swap" ? tokenOut : undefined,
          amountPerPeriod: amount.trim(),
          intervalSeconds: interval,
          periodsTotal: periods.trim() === "" ? 0 : Number(periods),
          funding: funding.trim(),
        }),
      }),
    onSuccess: () => {
      const id = computeStrategyId(session.walletAddress, saltRef.current);
      setCreatedId(id);
      onCreated?.();
      setTimeout(() => onCreated?.(), 2500);
    },
  });

  function startCreate() {
    const a = amount.trim();
    const f = funding.trim();
    if (!AMOUNT_RE.test(a) || parseFloat(a) <= 0) {
      setFormError("Enter a valid amount per run");
      return;
    }
    if (kind === "payment" && !recipient.trim()) {
      setFormError("Enter who to pay (a username or address)");
      return;
    }
    if (kind === "swap" && !tokenOut) {
      setFormError("Pick a token to buy");
      return;
    }
    if (periods.trim() !== "" && (!/^\d+$/.test(periods.trim()) || Number(periods) < 1)) {
      setFormError("Number of runs must be a whole number, or leave it empty");
      return;
    }
    if (!AMOUNT_RE.test(f) || parseFloat(f) < parseFloat(a)) {
      setFormError("Total to deposit must be at least one run");
      return;
    }
    setFormError(null);
    saltRef.current = newStrategySalt();
    flow.start();
  }

  const error = formError ?? flow.error;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
      onClick={() => { if (flow.phase !== "running") onClose(); }}
    >
      <div
        className="w-full max-w-md glass-card rounded-card p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {flow.phase !== "running" && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 text-text-secondary/40 hover:text-text-primary text-sm transition-colors"
          >
            ✕
          </button>
        )}

        {createdId ? (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center mx-auto mb-3 text-2xl">
              ✓
            </div>
            <h2 className="text-lg font-bold text-text-primary mb-1">Strategy created</h2>
            <p className="text-text-secondary text-sm mb-4">
              It is funded and scheduled. It runs automatically, no PIN needed each time.
            </p>
            <button
              onClick={onClose}
              className="block mx-auto text-xs text-text-secondary/50 hover:text-text-secondary transition-colors"
            >
              Done
            </button>
          </div>
        ) : flow.phase === "running" ? (
          <div className="text-center py-4">
            <div className="flex justify-center mb-3"><Spinner size="lg" /></div>
            <p className="text-text-secondary text-sm">
              Setting up your strategy… a PIN window will appear to confirm.
            </p>
          </div>
        ) : flow.phase === "auth" ? (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-text-primary">Confirm it&apos;s you</h2>
            <p className="text-sm text-text-secondary">
              We need to verify you to fund the strategy onchain.
            </p>
            {flow.auth.step === "email" && !flow.auth.loading && (
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
            )}
            {flow.auth.step === "email" && flow.auth.loading && (
              <div className="text-center py-2">
                <div className="flex justify-center mb-2"><Spinner size="lg" /></div>
                <p className="text-text-secondary text-sm">Sending your code…</p>
              </div>
            )}
            {flow.auth.step === "verify" && (
              <div className="text-center py-2">
                <div className="flex justify-center mb-2"><Spinner size="lg" /></div>
                <p className="text-text-secondary text-sm">
                  Enter the code from <span className="text-text-primary">{flow.auth.email}</span> in the window that opened.
                </p>
                {flow.auth.error && <p className="text-sm text-red-400 mt-2">{flow.auth.error}</p>}
              </div>
            )}
            <button
              onClick={flow.backToIdle}
              className="w-full text-sm text-blue-primary/60 hover:text-blue-primary transition-colors"
            >
              Back
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-text-primary">New strategy</h2>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setKind("payment"); setFormError(null); }}
                className={`rounded-input py-2 text-sm font-semibold transition-colors ${
                  kind === "payment"
                    ? "bg-blue-primary text-white shadow-glow"
                    : "bg-border/40 text-text-secondary hover:text-text-primary"
                }`}
              >
                Recurring payment
              </button>
              <button
                onClick={() => { setKind("swap"); setFormError(null); }}
                className={`rounded-input py-2 text-sm font-semibold transition-colors ${
                  kind === "swap"
                    ? "bg-blue-primary text-white shadow-glow"
                    : "bg-border/40 text-text-secondary hover:text-text-primary"
                }`}
              >
                Auto-buy (DCA)
              </button>
            </div>

            {kind === "payment" ? (
              <div>
                <label htmlFor="recipient" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Pay to
                </label>
                <Input
                  id="recipient"
                  type="text"
                  value={recipient}
                  onChange={(e) => { setRecipient(e.target.value); setFormError(null); }}
                  placeholder="username or 0x address"
                  autoFocus
                />
              </div>
            ) : (
              <div>
                <label htmlFor="tokenOut" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Buy
                </label>
                <select
                  id="tokenOut"
                  value={tokenOut}
                  onChange={(e) => { setTokenOut(e.target.value); setFormError(null); }}
                  className="w-full bg-border/40 text-text-primary rounded-input px-3 py-2.5 text-sm border border-border focus:border-blue-primary outline-none transition-colors"
                >
                  {swapTargets.length === 0 && <option value="">No tokens configured</option>}
                  {swapTargets.map((t) => (
                    <option key={t.symbol} value={t.address ?? ""}>
                      {t.symbol} · {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Amount per run
                </label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setFormError(null); }}
                  placeholder="USDC"
                />
              </div>
              <div>
                <label htmlFor="interval" className="block text-sm font-medium text-text-secondary mb-1.5">
                  How often
                </label>
                <select
                  id="interval"
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                  className="w-full bg-border/40 text-text-primary rounded-input px-3 py-2.5 text-sm border border-border focus:border-blue-primary outline-none transition-colors"
                >
                  {INTERVAL_PRESETS.map((p) => (
                    <option key={p.seconds} value={p.seconds}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="periods" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Number of runs
                </label>
                <Input
                  id="periods"
                  type="number"
                  value={periods}
                  onChange={(e) => { setPeriods(e.target.value); setFormError(null); }}
                  placeholder="leave empty = until funds run out"
                />
              </div>
              <div>
                <label htmlFor="funding" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Total to deposit
                </label>
                <Input
                  id="funding"
                  type="number"
                  value={funding}
                  onChange={(e) => { setFunding(e.target.value); setFormError(null); }}
                  placeholder="USDC"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={startCreate}>Create strategy</Button>
            <p className="text-xs text-text-secondary/40 text-center">
              The deposit is held in an onchain vault. You can pause or cancel anytime and
              get the remaining balance back.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
