"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi } from "viem";
import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";
import { ModalSuccess } from "@/shared/ui/ModalSuccess";
import { ModalHeader } from "@/shared/ui/ModalHeader";
import { AmountInput, Field, FIELD_CLS, LABEL_CLS } from "@/shared/ui/Field";
import { ChallengeAuthSteps } from "@/features/auth/ui/ChallengeAuthSteps";
import { useChallengeFlow } from "@/features/auth/model/useChallengeFlow";
import { computeStrategyId, newStrategySalt } from "@/entities/strategy/lib/computeStrategyId";
import { INTERVAL_PRESETS } from "@/entities/strategy/lib/format";
import { SWAP_TARGETS, USDC_ERC20_ADDRESS } from "@/shared/lib/tokens";
import { arcPublicClient } from "@/shared/lib/arc";
import { env } from "@/shared/config/env";
import type { Session } from "@/entities/user/model/types";

const AMOUNT_RE = /^\d+(\.\d{1,6})?$/;

type SavingsMode = "deposit" | "sweep";

/** Allowance at or above this is treated as "already approved" for sweep pulls. */
const SWEEP_ALLOWANCE_FLOOR = 2n ** 128n;

interface Props {
  session: Session;
  onClose: () => void;
  onCreated?: () => void;
}

/**
 * Create-savings modal: a target percent allocation across USDC/EURC/cirBTC, funded
 * either by a deposit or by sweeping the wallet balance. Form -> (approve if sweep) ->
 * PIN -> done. Onchain this is WooshStrategyRegistry.createPortfolio (Kind.Portfolio) —
 * "savings" is UI-only naming, the contract/API vocabulary stays "portfolio".
 */
export default function CreateSavingsModal({ session, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const swapTargets = SWAP_TARGETS.filter((t) => t.address);

  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState(INTERVAL_PRESETS[0].seconds);
  const [periods, setPeriods] = useState("");
  const [funding, setFunding] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [mode, setMode] = useState<SavingsMode>("deposit");
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

  const isSweep = mode === "sweep";

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
              kind: "portfolio",
              amountPerPeriod: amount.trim(),
              intervalSeconds: interval,
              periodsTotal: periods.trim() === "" ? 0 : Number(periods),
              funding: isSweep ? undefined : funding.trim(),
              allocation: allocation(),
              mode,
              sweepThreshold: threshold.trim() || "0",
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
      // One delayed refetch pass (see StrategyActionModal): the new savings strategy
      // shows up in the list; in deposit mode the funding also left the wallet.
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["strategies", session.walletAddress] });
        void queryClient.invalidateQueries({ queryKey: ["token-balances", session.walletAddress] });
        void queryClient.invalidateQueries({ queryKey: ["usdc-balance", session.walletAddress] });
        onCreated?.();
      }, 2_000);
    },
  });

  async function startCreate() {
    const a = amount.trim();
    const f = funding.trim();
    if (!AMOUNT_RE.test(a) || parseFloat(a) <= 0) {
      setFormError(isSweep ? "Enter a valid max per sweep" : "Enter a valid amount per run");
      return;
    }
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

  const cadence = INTERVAL_PRESETS.find((p) => p.seconds === interval)?.label.toLowerCase() ?? "";
  const runsNum = periods.trim() === "" ? 0 : Number(periods);
  const suggestedFunding =
    AMOUNT_RE.test(amount.trim()) && Number.isInteger(runsNum) && runsNum > 0
      ? String(+(parseFloat(amount) * runsNum).toFixed(6))
      : "";

  const allocLabel = allocation()
    .map((l) => `${l.bps / 100}% ${l.symbol}`)
    .join(" / ");
  const summary = isSweep
    ? `Keep ${allocLabel}, sweeping balance above ${threshold.trim() || "0"} USDC ${cadence}`
    : amount.trim()
      ? `Allocate ${amount} USDC to ${allocLabel} ${cadence}`
      : null;
  const scheduleNote = isSweep
    ? `Up to ${amount.trim() || "…"} USDC per sweep, straight from your wallet`
    : runsNum > 0
      ? `${runsNum} run${runsNum > 1 ? "s" : ""}${funding.trim() ? ` · ${funding} USDC deposit` : ""}`
      : "Runs until the deposit runs out";

  return (
    <Modal onClose={onClose} dismissible={flow.phase !== "running"} size="lg">
        {createdId ? (
          <ModalSuccess
            title="Savings created"
            body={
              isSweep
                ? "It watches your balance and allocates the excess on schedule."
                : "It is funded and scheduled. It runs automatically."
            }
            onClose={onClose}
            closeLabel="Done"
          />
        ) : flow.phase === "running" ? (
          <div className="text-center py-4">
            <span className="shimmer-text text-sm font-medium">
              {stageUi === "approve"
                ? "Step 1 of 2: approving the sweep allowance… a PIN window will appear."
                : isSweep
                  ? "Step 2 of 2: creating your savings… confirm with your PIN."
                  : "Setting up your savings… a PIN window will appear to confirm."}
            </span>
          </div>
        ) : flow.phase === "auth" ? (
          <ChallengeAuthSteps
            knownEmail={session.email}
            auth={flow.auth}
            onBack={flow.backToIdle}
            intro="We need to verify you to fund this onchain."
          />
        ) : (
          <div className="space-y-5">
            <ModalHeader
              title="New savings"
              subtitle="A target mix across USDC, EURC and cirBTC, topped up on autopilot."
              icon="◔"
              iconClassName="bg-violet-400/10 text-violet-400"
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-text-secondary">Target allocation</span>
                <span className={`text-xs ${
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
                          aria-label={`${sym} allocation percent`}
                          value={pct[sym] ?? "0"}
                          onChange={(e) => { setPct((p) => ({ ...p, [sym]: e.target.value })); setFormError(null); }}
                          className={`${FIELD_CLS} pr-8`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <span className={LABEL_CLS}>Funded by</span>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { m: "deposit" as SavingsMode, label: "A deposit", hint: "budget held onchain" },
                  { m: "sweep" as SavingsMode, label: "Wallet balance", hint: "sweeps the excess" },
                ]).map(({ m, label, hint }) => (
                  <button
                    key={m}
                    aria-pressed={mode === m}
                    onClick={() => { setMode(m); setFormError(null); }}
                    className={`rounded-input border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40 ${
                      mode === m
                        ? "border-blue-primary bg-blue-primary/10"
                        : "border-border bg-border/30 hover:border-border/80"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-text-primary">{label}</span>
                    <span className="block text-xs text-text-secondary/60 mt-0.5">{hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {isSweep && (
              <AmountInput
                id="threshold"
                label="Always keep in wallet"
                value={threshold}
                onValueChange={(v) => { setThreshold(v); setFormError(null); }}
                suffix="USDC"
                hint="Anything above this gets allocated on schedule. Needs a one-time approval (extra PIN) the first time."
              />
            )}

            {/* Amount per run */}
            <AmountInput
              id="amount"
              label={isSweep ? "Max per sweep" : "Allocate per run"}
              value={amount}
              onValueChange={(v) => { setAmount(v); setFormError(null); }}
              suffix="USDC"
            />

            {/* Interval — pills */}
            <div>
              <span className={LABEL_CLS}>How often</span>
              <div className="grid grid-cols-3 gap-2">
                {INTERVAL_PRESETS.map((p) => (
                  <button
                    key={p.seconds}
                    aria-pressed={interval === p.seconds}
                    onClick={() => setInterval(p.seconds)}
                    className={`rounded-input py-2 text-sm font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40 ${
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
              <Field label="Number of runs" htmlFor="periods">
                <input
                  id="periods"
                  type="number"
                  inputMode="numeric"
                  value={periods}
                  onChange={(e) => { setPeriods(e.target.value); setFormError(null); }}
                  placeholder={isSweep ? "∞ until cancelled" : "∞ until empty"}
                  className={FIELD_CLS}
                />
              </Field>
              {!isSweep && (
                <Field
                  label="Total to deposit"
                  htmlFor="funding"
                  labelEnd={
                    suggestedFunding && suggestedFunding !== funding ? (
                      <button
                        onClick={() => { setFunding(suggestedFunding); setFormError(null); }}
                        className="text-xs text-blue-primary/70 hover:text-blue-primary transition-colors"
                      >
                        use {suggestedFunding}
                      </button>
                    ) : undefined
                  }
                >
                  <div className="relative">
                    <input
                      id="funding"
                      type="number"
                      inputMode="decimal"
                      value={funding}
                      onChange={(e) => { setFunding(e.target.value); setFormError(null); }}
                      placeholder="0.00"
                      className={`${FIELD_CLS} pr-16`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">USDC</span>
                  </div>
                </Field>
              )}
            </div>

            {/* Live summary */}
            {summary && (
              <div className="rounded-input bg-blue-primary/[0.06] border border-blue-primary/15 px-4 py-3">
                <p className="text-sm text-text-primary font-medium">{summary}</p>
                <p className="text-xs text-text-secondary/50 mt-1">{scheduleNote}</p>
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={startCreate}>Create savings</Button>
            <p className="text-xs text-text-secondary/40 text-center">
              Held in an onchain vault. Pause or cancel anytime and get the remaining balance back.
            </p>
          </div>
        )}
    </Modal>
  );
}
