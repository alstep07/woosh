"use client";

import { useRef, useState } from "react";
import { erc20Abi } from "viem";
import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";
import { EmailStep } from "@/features/auth/ui/EmailStep";
import { AutoOtpStatus } from "@/features/auth/ui/AutoOtpStatus";
import { useChallengeFlow } from "@/features/auth/model/useChallengeFlow";
import { computeStrategyId, newStrategySalt } from "@/entities/strategy/lib/computeStrategyId";
import { INTERVAL_PRESETS } from "@/entities/strategy/lib/format";
import { SWAP_TARGETS, USDC_ERC20_ADDRESS } from "@/shared/lib/tokens";
import { arcPublicClient } from "@/shared/lib/arc";
import { env } from "@/shared/config/env";
import type { Session } from "@/entities/user/model/types";

const AMOUNT_RE = /^\d+(\.\d{1,6})?$/;

type Kind = "payment" | "swap" | "portfolio";
type PortfolioMode = "deposit" | "sweep";

/** Allowance at or above this is treated as "already approved" for sweep pulls. */
const SWEEP_ALLOWANCE_FLOOR = 2n ** 128n;

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

  // Portfolio: percent per symbol (integers, must sum to 100) + funding mode.
  const [mode, setMode] = useState<PortfolioMode>("deposit");
  const [threshold, setThreshold] = useState("");
  const [pct, setPct] = useState<Record<string, string>>(() => {
    const withBtc = swapTargets.some((t) => t.symbol === "cirBTC");
    const withEur = swapTargets.some((t) => t.symbol === "EURC");
    if (withBtc && withEur) return { USDC: "50", cirBTC: "30", EURC: "20" };
    const only = swapTargets[0]?.symbol;
    return only ? { USDC: "50", [only]: "50" } : { USDC: "100" };
  });

  const saltRef = useRef<string>("");
  // Sweep needs a one-time allowance before create: stage "approve" runs first, then
  // chains into "create" (cached tokens skip the OTP, so it goes straight to PIN).
  const stageRef = useRef<"approve" | "create">("create");
  const [stageUi, setStageUi] = useState<"approve" | "create">("create");

  const allocation = () =>
    ["USDC", ...swapTargets.map((t) => t.symbol)]
      .map((sym) => ({ symbol: sym, bps: Math.round(Number(pct[sym] ?? "0")) * 100 }))
      .filter((l) => l.bps > 0);

  const flow = useChallengeFlow({
    prefillEmail: session.email,
    request: (userToken) =>
      stageRef.current === "approve"
        ? fetch("/api/wallet/approve-sweep", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userToken }),
          })
        : fetch("/api/wallet/create-strategy", {
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
              funding: kind === "portfolio" && mode === "sweep" ? undefined : funding.trim(),
              ...(kind === "portfolio"
                ? { allocation: allocation(), mode, sweepThreshold: threshold.trim() || "0" }
                : {}),
            }),
          }),
    onSuccess: () => {
      if (stageRef.current === "approve") {
        stageRef.current = "create";
        setStageUi("create");
        flow.start();
        return;
      }
      const id = computeStrategyId(session.walletAddress, saltRef.current);
      setCreatedId(id);
      onCreated?.();
      setTimeout(() => onCreated?.(), 2500);
    },
  });

  async function startCreate() {
    const a = amount.trim();
    const f = funding.trim();
    const isSweep = kind === "portfolio" && mode === "sweep";
    if (!AMOUNT_RE.test(a) || parseFloat(a) <= 0) {
      setFormError(isSweep ? "Enter a valid max per sweep" : "Enter a valid amount per run");
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
    if (kind === "portfolio") {
      const legs = allocation();
      const sum = legs.reduce((s, l) => s + l.bps, 0);
      if (sum !== 10_000) {
        setFormError("Allocation must add up to 100%");
        return;
      }
      if (!legs.some((l) => l.symbol !== "USDC")) {
        setFormError("Allocate something besides USDC");
        return;
      }
      if (isSweep && threshold.trim() !== "" && !AMOUNT_RE.test(threshold.trim())) {
        setFormError("Enter a valid balance to keep");
        return;
      }
    }
    if (periods.trim() !== "" && (!/^\d+$/.test(periods.trim()) || Number(periods) < 1)) {
      setFormError("Number of runs must be a whole number, or leave it empty");
      return;
    }
    if (!isSweep && (!AMOUNT_RE.test(f) || parseFloat(f) < parseFloat(a))) {
      setFormError("Total to deposit must be at least one run");
      return;
    }
    setFormError(null);
    saltRef.current = newStrategySalt();

    // Sweep: skip the approve step when the registry already has a big enough allowance.
    let stage: "approve" | "create" = "create";
    if (isSweep && env.strategyRegistryAddress) {
      try {
        const allowance = await arcPublicClient.readContract({
          address: USDC_ERC20_ADDRESS,
          abi: erc20Abi,
          functionName: "allowance",
          args: [session.walletAddress as `0x${string}`, env.strategyRegistryAddress],
        });
        if (allowance < SWEEP_ALLOWANCE_FLOOR) stage = "approve";
      } catch {
        stage = "approve"; // can't read: safer to (re)approve than to fail the sweep later
      }
    }
    stageRef.current = stage;
    setStageUi(stage);
    flow.start();
  }

  const error = formError ?? flow.error;

  const fieldCls =
    "w-full bg-border/40 text-text-primary rounded-input px-3 py-2.5 text-sm border border-border focus:border-blue-primary outline-none transition-colors placeholder:text-text-secondary/40";
  const labelCls = "block text-xs font-medium text-text-secondary mb-1.5";

  const cadence = INTERVAL_PRESETS.find((p) => p.seconds === interval)?.label.toLowerCase() ?? "";
  const runsNum = periods.trim() === "" ? 0 : Number(periods);
  const suggestedFunding =
    AMOUNT_RE.test(amount.trim()) && Number.isInteger(runsNum) && runsNum > 0
      ? String(+(parseFloat(amount) * runsNum).toFixed(6))
      : "";

  const tokenSym = swapTargets.find((t) => t.address === tokenOut)?.symbol;
  const isSweep = kind === "portfolio" && mode === "sweep";
  const allocLabel = allocation()
    .map((l) => `${l.bps / 100}% ${l.symbol}`)
    .join(" / ");
  const summary =
    kind === "portfolio"
      ? isSweep
        ? `Keep ${allocLabel}, sweeping balance above ${threshold.trim() || "0"} USDC ${cadence}`
        : amount.trim()
          ? `Allocate ${amount} USDC to ${allocLabel} ${cadence}`
          : null
      : amount.trim()
        ? kind === "payment"
          ? `Pay ${amount} USDC ${cadence}${recipient.trim() ? ` to ${recipient.trim()}` : ""}`
          : `Buy ${tokenSym ?? "token"} with ${amount} USDC ${cadence}`
        : null;
  const scheduleNote = isSweep
    ? `Up to ${amount.trim() || "…"} USDC per sweep, straight from your wallet`
    : runsNum > 0
      ? `${runsNum} run${runsNum > 1 ? "s" : ""}${funding.trim() ? ` · ${funding} USDC deposit` : ""}`
      : "Runs until the deposit runs out";

  return (
    <Modal onClose={onClose} dismissible={flow.phase !== "running"} size="md">
        {createdId ? (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center mx-auto mb-3 text-2xl">
              ✓
            </div>
            <h2 className="text-lg font-bold text-text-primary mb-1">
              {kind === "portfolio" ? "Portfolio created" : "Strategy created"}
            </h2>
            <p className="text-text-secondary text-sm mb-4">
              {isSweep
                ? "It watches your balance and allocates the excess on schedule. No PIN needed each time."
                : "It is funded and scheduled. It runs automatically, no PIN needed each time."}
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
            <span className="shimmer-text text-sm font-medium">
              {stageUi === "approve"
                ? "Step 1 of 2: approving the sweep allowance… a PIN window will appear."
                : isSweep
                  ? "Step 2 of 2: creating the portfolio… confirm with your PIN."
                  : "Setting up your strategy… a PIN window will appear to confirm."}
            </span>
          </div>
        ) : flow.phase === "auth" ? (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-text-primary">Confirm it&apos;s you</h2>
            <p className="text-sm text-text-secondary">
              We need to verify you to fund the strategy onchain.
            </p>
            {flow.auth.step === "email" && !flow.auth.loading && (
              session.email ? (
                <AutoOtpStatus
                  email={session.email}
                  error={flow.auth.error}
                  deviceIdError={flow.auth.deviceIdError}
                  onRetryDeviceId={flow.auth.retryDeviceId}
                  onResend={flow.auth.sendOtp}
                />
              ) : (
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
              )
            )}
            {flow.auth.step === "email" && flow.auth.loading && (
              <div className="text-center py-2">
                <span className="shimmer-text text-sm font-medium">Sending your code…</span>
              </div>
            )}
            {flow.auth.step === "verify" && (
              <div className="text-center py-2 space-y-1">
                <span className="shimmer-text text-sm font-medium">Enter the code in the window that opened.</span>
                <p className="text-xs text-text-secondary/50">Code sent to {flow.auth.email}</p>
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
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-text-primary">New strategy</h2>

            {/* Kind — segmented control */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-border/30 rounded-input">
              {([
                { k: "payment" as Kind, label: "Recurring", glyph: "↻" },
                { k: "swap" as Kind, label: "Auto-buy", glyph: "₿" },
                { k: "portfolio" as Kind, label: "Portfolio", glyph: "◔" },
              ]).map(({ k, label, glyph }) => (
                <button
                  key={k}
                  onClick={() => { setKind(k); setFormError(null); }}
                  className={`flex items-center justify-center gap-1.5 rounded-[5px] py-2 text-sm font-semibold transition-all ${
                    kind === k
                      ? "bg-blue-primary text-white shadow-glow"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <span aria-hidden className="text-base leading-none">{glyph}</span>
                  {label}
                </button>
              ))}
            </div>

            {/* Portfolio: allocation + funding mode */}
            {kind === "portfolio" && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-text-secondary">Target allocation</span>
                    <span className={`text-[11px] ${
                      allocation().reduce((s, l) => s + l.bps, 0) === 10_000
                        ? "text-green-400/70"
                        : "text-amber-400/80"
                    }`}>
                      {allocation().reduce((s, l) => s + l.bps, 0) / 100}% of 100%
                    </span>
                  </div>
                  <div className="space-y-2">
                    {["USDC", ...swapTargets.map((t) => t.symbol)].map((sym) => {
                      const g = sym === "cirBTC" ? "₿" : sym === "EURC" ? "€" : "$";
                      const gCls =
                        sym === "cirBTC"
                          ? "bg-amber-400/15 text-amber-400"
                          : sym === "EURC"
                            ? "bg-blue-secondary/15 text-blue-secondary"
                            : "bg-green-400/15 text-green-400";
                      return (
                        <div key={sym} className="flex items-center gap-2">
                          <span className={`h-6 w-6 shrink-0 rounded-full grid place-items-center text-xs font-bold ${gCls}`}>{g}</span>
                          <span className="w-16 text-sm font-semibold text-text-primary">{sym}</span>
                          <div className="relative flex-1">
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={100}
                              value={pct[sym] ?? "0"}
                              onChange={(e) => { setPct((p) => ({ ...p, [sym]: e.target.value })); setFormError(null); }}
                              className={`${fieldCls} pr-8`}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className={labelCls}>Funded by</span>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { m: "deposit" as PortfolioMode, label: "A deposit", hint: "budget held onchain" },
                      { m: "sweep" as PortfolioMode, label: "Wallet balance", hint: "sweeps the excess" },
                    ]).map(({ m, label, hint }) => (
                      <button
                        key={m}
                        onClick={() => { setMode(m); setFormError(null); }}
                        className={`rounded-input border px-3 py-2.5 text-left transition-colors ${
                          mode === m
                            ? "border-blue-primary bg-blue-primary/10"
                            : "border-border bg-border/30 hover:border-border/80"
                        }`}
                      >
                        <span className="block text-sm font-semibold text-text-primary">{label}</span>
                        <span className="block text-[11px] text-text-secondary/60">{hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {isSweep && (
                  <div>
                    <label htmlFor="threshold" className={labelCls}>Always keep in wallet</label>
                    <div className="relative">
                      <input
                        id="threshold"
                        type="number"
                        inputMode="decimal"
                        value={threshold}
                        onChange={(e) => { setThreshold(e.target.value); setFormError(null); }}
                        placeholder="0.00"
                        className={`${fieldCls} pr-16`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">USDC</span>
                    </div>
                    <p className="text-[11px] text-text-secondary/50 mt-1.5">
                      Anything above this gets allocated on schedule. Needs a one-time approval (extra PIN) the first time.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Recipient (payment) or token (swap) */}
            {kind === "portfolio" ? null : kind === "payment" ? (
              <div>
                <label htmlFor="recipient" className={labelCls}>Pay to</label>
                <input
                  id="recipient"
                  type="text"
                  value={recipient}
                  onChange={(e) => { setRecipient(e.target.value); setFormError(null); }}
                  placeholder="username or 0x address"
                  autoFocus
                  className={fieldCls}
                />
              </div>
            ) : (
              <div>
                <span className={labelCls}>Buy</span>
                <div className="grid grid-cols-2 gap-2">
                  {swapTargets.length === 0 && (
                    <p className="col-span-2 text-xs text-text-secondary/50">No tokens configured</p>
                  )}
                  {swapTargets.map((t) => {
                    const active = tokenOut === t.address;
                    const g = t.symbol === "cirBTC" ? "₿" : "€";
                    return (
                      <button
                        key={t.symbol}
                        onClick={() => { setTokenOut(t.address ?? ""); setFormError(null); }}
                        className={`flex items-center gap-2 rounded-input border px-3 py-2.5 text-sm transition-colors ${
                          active
                            ? "border-blue-primary bg-blue-primary/10 text-text-primary"
                            : "border-border bg-border/30 text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        <span className={`h-6 w-6 shrink-0 rounded-full grid place-items-center text-xs font-bold ${
                          t.symbol === "cirBTC" ? "bg-amber-400/15 text-amber-400" : "bg-blue-secondary/15 text-blue-secondary"
                        }`}>{g}</span>
                        <span className="font-semibold">{t.symbol}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Amount per run */}
            <div>
              <label htmlFor="amount" className={labelCls}>
                {kind === "payment"
                  ? "Amount per payment"
                  : kind === "swap"
                    ? "Spend per run"
                    : isSweep
                      ? "Max per sweep"
                      : "Allocate per run"}
              </label>
              <div className="relative">
                <input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setFormError(null); }}
                  placeholder="0.00"
                  className={`${fieldCls} pr-16`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">USDC</span>
              </div>
            </div>

            {/* Interval — pills */}
            <div>
              <span className={labelCls}>How often</span>
              <div className="grid grid-cols-3 gap-2">
                {INTERVAL_PRESETS.map((p) => (
                  <button
                    key={p.seconds}
                    onClick={() => setInterval(p.seconds)}
                    className={`rounded-input py-2 text-sm font-medium border transition-colors ${
                      interval === p.seconds
                        ? "border-blue-primary bg-blue-primary/10 text-text-primary"
                        : "border-border bg-border/30 text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Runs + deposit */}
            <div className={`grid gap-3 ${isSweep ? "grid-cols-1" : "grid-cols-2"}`}>
              <div>
                <label htmlFor="periods" className={labelCls}>Number of runs</label>
                <input
                  id="periods"
                  type="number"
                  inputMode="numeric"
                  value={periods}
                  onChange={(e) => { setPeriods(e.target.value); setFormError(null); }}
                  placeholder={isSweep ? "∞ until cancelled" : "∞ until empty"}
                  className={fieldCls}
                />
              </div>
              {!isSweep && <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="funding" className="text-xs font-medium text-text-secondary">Total to deposit</label>
                  {suggestedFunding && suggestedFunding !== funding && (
                    <button
                      onClick={() => { setFunding(suggestedFunding); setFormError(null); }}
                      className="text-[11px] text-blue-primary/70 hover:text-blue-primary transition-colors"
                    >
                      use {suggestedFunding}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="funding"
                    type="number"
                    inputMode="decimal"
                    value={funding}
                    onChange={(e) => { setFunding(e.target.value); setFormError(null); }}
                    placeholder="0.00"
                    className={`${fieldCls} pr-16`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">USDC</span>
                </div>
              </div>}
            </div>

            {/* Live summary */}
            {summary && (
              <div className="rounded-input bg-blue-primary/5 border border-blue-primary/15 px-3.5 py-2.5">
                <p className="text-sm text-text-primary">{summary}</p>
                <p className="text-xs text-text-secondary/50 mt-0.5">{scheduleNote}</p>
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={startCreate}>Create strategy</Button>
            <p className="text-xs text-text-secondary/40 text-center">
              Held in an onchain vault. Pause or cancel anytime and get the remaining balance back.
            </p>
          </div>
        )}
    </Modal>
  );
}
