"use client";

import { useRef, useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";
import { ModalSuccess } from "@/shared/ui/ModalSuccess";
import { ModalHeader } from "@/shared/ui/ModalHeader";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { Field, AmountInput, FIELD_CLS, LABEL_CLS } from "@/shared/ui/Field";
import { ChallengeAuthSteps } from "@/features/auth/ui/ChallengeAuthSteps";
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
 * Target-allocation savings (Kind.Portfolio) live in a separate CreateSavingsModal.
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

  const cadence = INTERVAL_PRESETS.find((p) => p.seconds === interval)?.label.toLowerCase() ?? "";
  const runsNum = periods.trim() === "" ? 0 : Number(periods);
  const suggestedFunding =
    AMOUNT_RE.test(amount.trim()) && Number.isInteger(runsNum) && runsNum > 0
      ? String(+(parseFloat(amount) * runsNum).toFixed(6))
      : "";

  const tokenSym = swapTargets.find((t) => t.address === tokenOut)?.symbol;
  const summary = amount.trim()
    ? kind === "payment"
      ? `Pay ${amount} USDC ${cadence}${recipient.trim() ? ` to ${recipient.trim()}` : ""}`
      : `Buy ${tokenSym ?? "token"} with ${amount} USDC ${cadence}`
    : null;
  const scheduleNote =
    runsNum > 0
      ? `${runsNum} run${runsNum > 1 ? "s" : ""}${funding.trim() ? ` · ${funding} USDC deposit` : ""}`
      : "Runs until the deposit runs out";

  return (
    <Modal onClose={onClose} dismissible={flow.phase !== "running"} size="md">
        {createdId ? (
          <ModalSuccess
            title="Automation created"
            body="It is funded and scheduled. It runs automatically."
            onClose={onClose}
            closeLabel="Done"
          />
        ) : flow.phase === "running" ? (
          <div className="text-center py-4">
            <span className="shimmer-text text-sm font-medium">
              Setting up your automation… a PIN window will appear to confirm.
            </span>
          </div>
        ) : flow.phase === "auth" ? (
          <ChallengeAuthSteps
            knownEmail={session.email}
            auth={flow.auth}
            onBack={flow.backToIdle}
            intro="We need to verify you to fund the automation onchain."
          />
        ) : (
          <div className="space-y-5">
            <ModalHeader
              title="New automation"
              subtitle="A recurring payment or a scheduled auto-buy, funded once and run on autopilot."
              icon="↻"
            />

            {/* Kind — segmented control */}
            <SegmentedControl
              aria-label="Strategy kind"
              options={[
                { value: "payment" as Kind, label: "Recurring", glyph: "↻" },
                { value: "swap" as Kind, label: "Auto-buy", glyph: "₿" },
              ]}
              value={kind}
              onChange={(k) => { setKind(k); setFormError(null); }}
            />

            {/* Recipient (payment) or token (swap) */}
            {kind === "payment" ? (
              <Field label="Pay to" htmlFor="recipient">
                <input
                  id="recipient"
                  type="text"
                  value={recipient}
                  onChange={(e) => { setRecipient(e.target.value); setFormError(null); }}
                  placeholder="username or 0x address"
                  autoFocus
                  className={FIELD_CLS}
                />
              </Field>
            ) : (
              <div>
                <span className={LABEL_CLS}>Buy</span>
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
                        aria-pressed={active}
                        onClick={() => { setTokenOut(t.address ?? ""); setFormError(null); }}
                        className={`flex items-center gap-2 rounded-input border px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40 ${
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
            <AmountInput
              id="amount"
              label={kind === "payment" ? "Amount per payment" : "Spend per run"}
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
            <div className="grid gap-3 grid-cols-2">
              <Field label="Number of runs" htmlFor="periods">
                <input
                  id="periods"
                  type="number"
                  inputMode="numeric"
                  value={periods}
                  onChange={(e) => { setPeriods(e.target.value); setFormError(null); }}
                  placeholder="∞ until empty"
                  className={FIELD_CLS}
                />
              </Field>
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
            </div>

            {/* Live summary */}
            {summary && (
              <div className="rounded-input bg-blue-primary/[0.06] border border-blue-primary/15 px-4 py-3">
                <p className="text-sm text-text-primary font-medium">{summary}</p>
                <p className="text-xs text-text-secondary/50 mt-1">{scheduleNote}</p>
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={startCreate}>Create automation</Button>
            <p className="text-xs text-text-secondary/40 text-center">
              Held in an onchain vault. Pause or cancel anytime and get the remaining balance back.
            </p>
          </div>
        )}
    </Modal>
  );
}
