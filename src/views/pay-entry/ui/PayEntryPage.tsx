"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseUnits, formatUnits } from "viem";
import AppHeader from "@/widgets/AppHeader/ui/AppHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";
import { PageHeader } from "@/shared/ui/PageHeader";
import { EmptyState } from "@/shared/ui/EmptyState";
import { RefreshButton } from "@/shared/ui/RefreshButton";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { Field, FIELD_CLS } from "@/shared/ui/Field";
import { RecipientRows, type RecipientRow } from "@/shared/ui/RecipientRows";
import { RecurringScheduleFields } from "@/shared/ui/RecurringScheduleFields";
import { RecurringCard, RecurringPastRow } from "@/shared/ui/RecurringCard";
import { ConfirmActionModal } from "@/features/auth/ui/ConfirmActionModal";
import StrategyActionModal, { type StrategyAction } from "@/widgets/CreateStrategyModal/ui/StrategyActionModal";
import { resolveSlug } from "@/entities/slug/lib/resolveSlug";
import { getSession as loadSession } from "@/shared/lib/session";
import { useMyStrategies } from "@/entities/strategy/hooks/useMyStrategies";
import { INTERVAL_PRESETS } from "@/entities/strategy/lib/format";
import { newStrategySalt } from "@/entities/strategy/lib/computeStrategyId";
import { AMOUNT_RE, isValidAmount } from "@/shared/lib/amount";
import type { OnchainStrategy } from "@/entities/strategy/model/types";
import type { Session } from "@/entities/user/model/types";

type Mode = "once" | "recurring";

function short(addr?: string | null): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";
}

function emptyRows(): RecipientRow[] {
  return [{ to: "", amount: "" }, { to: "", amount: "" }];
}

/** Sum of valid row amounts, in wei (native USDC, 18 decimals). Bigint throughout,
 *  no float arithmetic on money, per project convention. */
function rowsTotalWei(rows: RecipientRow[]): bigint {
  return rows.reduce(
    (sum, r) => (isValidAmount(r.amount) ? sum + parseUnits(r.amount.trim(), 18) : sum),
    0n
  );
}

/** Human-decimal string for display, trailing zeros stripped. */
function fmtWei(wei: bigint): string {
  return wei > 0n ? formatUnits(wei, 18).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") : "0";
}

function rowsValid(rows: RecipientRow[], min = 2): boolean {
  return rows.length >= min && rows.every((r) => r.to.trim() && isValidAmount(r.amount));
}

/**
 * Payments hub: one-off payments (single or batch) and recurring payments (single or
 * payroll), plus the list of recurring payments already running. Money you convert
 * lives under Swap; money you set aside lives under Savings. This page owns everything
 * that leaves the wallet to someone else.
 *
 * Layout: a list-and-tool page (a create form plus a "what's already running" list),
 * same shape as Swap. At lg+ it splits into two columns, form left / list right, so the
 * list isn't hidden below a scroll on wide viewports; below lg it stacks, form first.
 * The recurring list is shown regardless of Once/Recurring mode (it reflects existing
 * commitments, not the form you're currently filling), so the right column never sits
 * empty. Savings and Invoices are plain single-column list pages and stay narrower
 * (max-w-2xl throughout) — see the width comment below.
 */
export default function PayEntryPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>("once");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Once — single
  const [value, setValue] = useState("");
  const [singleError, setSingleError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Once — batch
  const [onceMulti, setOnceMulti] = useState(false);
  const [onceRows, setOnceRows] = useState<RecipientRow[]>(emptyRows());
  const [onceMemo, setOnceMemo] = useState("");
  const [onceError, setOnceError] = useState<string | null>(null);
  const [onceConfirm, setOnceConfirm] = useState(false);

  // Recurring — single
  const [recurringMulti, setRecurringMulti] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState(INTERVAL_PRESETS[0].seconds);
  const [periods, setPeriods] = useState("");
  const [funding, setFunding] = useState("");
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [recurringConfirm, setRecurringConfirm] = useState(false);

  // Recurring — payroll
  const [payrollRows, setPayrollRows] = useState<RecipientRow[]>(emptyRows());
  const [payrollMemo, setPayrollMemo] = useState("");
  const [payrollInterval, setPayrollInterval] = useState(INTERVAL_PRESETS[0].seconds);
  const [payrollPeriods, setPayrollPeriods] = useState("");
  const [payrollFunding, setPayrollFunding] = useState("");
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [payrollConfirm, setPayrollConfirm] = useState(false);

  const saltRef = useRef<string>("");
  const [pendingStrategy, setPendingStrategy] = useState<{ strategy: OnchainStrategy; action: StrategyAction } | null>(null);

  const { strategies: allStrategies, loading: strategiesLoading, isError: strategiesError, refetch } = useMyStrategies(session?.walletAddress);
  const strategies = allStrategies.filter((s) => s.kind === "payment");
  const active = strategies.filter((s) => s.status === "active" || s.status === "paused" || s.status === "depleted");
  const closed = strategies.filter((s) => s.status === "completed" || s.status === "cancelled");

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/signup"); return; }
    setSession(s);
  }, [router]);

  async function handleSingleSubmit() {
    const raw = value.trim().replace(/^@/, "");
    if (!raw || checking) return;
    setSingleError(null);

    const isAddress = /^0x[0-9a-fA-F]{40}$/.test(raw);
    const query = isAddress ? raw : raw.toLowerCase();

    setChecking(true);
    const resolved = await resolveSlug(query);
    setChecking(false);

    if (!resolved) {
      setSingleError(isAddress ? "That doesn't look like a valid wallet address." : `No one is registered as "${raw}".`);
      return;
    }
    router.push(`/pay/${query}`);
  }

  function startOnceBatch() {
    if (!rowsValid(onceRows, 1)) {
      setOnceError("Enter every recipient and a valid amount");
      return;
    }
    setOnceError(null);
    setOnceConfirm(true);
  }

  function startRecurringSingle() {
    const a = amount.trim();
    const f = funding.trim();
    if (!recipient.trim()) { setRecurringError("Enter who to pay (a username or address)"); return; }
    if (!AMOUNT_RE.test(a) || parseFloat(a) <= 0) { setRecurringError("Enter a valid amount per run"); return; }
    if (periods.trim() !== "" && (!/^\d+$/.test(periods.trim()) || Number(periods) < 1)) {
      setRecurringError("Number of runs must be a whole number, or leave it empty");
      return;
    }
    if (!AMOUNT_RE.test(f) || parseFloat(f) < parseFloat(a)) { setRecurringError("Total to deposit must be at least one run"); return; }
    setRecurringError(null);
    saltRef.current = newStrategySalt();
    setRecurringConfirm(true);
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }

  function startPayroll() {
    if (!rowsValid(payrollRows)) { setPayrollError("Enter every recipient and a valid amount"); return; }
    const f = payrollFunding.trim();
    const totalWei = rowsTotalWei(payrollRows);
    if (payrollPeriods.trim() !== "" && (!/^\d+$/.test(payrollPeriods.trim()) || Number(payrollPeriods) < 1)) {
      setPayrollError("Number of runs must be a whole number, or leave it empty");
      return;
    }
    if (!AMOUNT_RE.test(f) || parseUnits(f, 18) < totalWei) { setPayrollError("Total to deposit must be at least one run"); return; }
    setPayrollError(null);
    saltRef.current = newStrategySalt();
    setPayrollConfirm(true);
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-navy flex items-center justify-center">
        <span className="shimmer-text text-sm font-medium">Loading…</span>
      </main>
    );
  }

  const recurringCadence = INTERVAL_PRESETS.find((p) => p.seconds === interval)?.label.toLowerCase() ?? "";
  const recurringRuns = periods.trim() === "" ? 0 : Number(periods);
  const recurringSuggestedFunding =
    isValidAmount(amount) && Number.isInteger(recurringRuns) && recurringRuns > 0
      ? fmtWei(parseUnits(amount.trim(), 18) * BigInt(recurringRuns))
      : "";

  const payrollTotalWei = rowsTotalWei(payrollRows);
  const payrollRuns = payrollPeriods.trim() === "" ? 0 : Number(payrollPeriods);
  const payrollSuggestedFunding =
    payrollTotalWei > 0n && Number.isInteger(payrollRuns) && payrollRuns > 0
      ? fmtWei(payrollTotalWei * BigInt(payrollRuns))
      : "";

  const onceTotalWei = rowsTotalWei(onceRows);

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <AppHeader />
      {/* Content width: list-and-tool pages (Payments, Swap) get a wider max-w-5xl
          container so a two-column split fits at lg+; plain list pages (Savings,
          Invoices) stay at max-w-2xl. See the class comment on the grid below. */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 mx-auto w-full max-w-2xl lg:max-w-5xl">
        {/* Two columns at lg+: form left (more room, 3fr), recurring list right (2fr).
            Below lg this stacks, form first, list second — the form is the primary
            "why did I come here" action, the list is supporting context. */}
        <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:gap-8 lg:items-start">
          <div>
            {/* Refresh lives on the list's own header below, not here: it refreshes the
                recurring-payments list specifically, not the create form, so it belongs
                next to what it targets. The action row is wrapped at a fixed min-height
                that matches the list header's row exactly, so the two cards' top edges
                line up across the two columns regardless of font-size differences. */}
            <PageHeader
              title="Payments"
              className="mb-6"
              action={
                <div className="min-h-[2.25rem] flex items-center">
                  <SegmentedControl
                    size="sm"
                    aria-label="Payments mode"
                    options={[
                      { value: "once" as Mode, label: "Once", glyph: "→" },
                      { value: "recurring" as Mode, label: "Recurring", glyph: "↻" },
                    ]}
                    value={mode}
                    onChange={setMode}
                  />
                </div>
              }
            />

            {/* Once and Recurring are stacked in the same grid cell (both always
                mounted, only one visible) instead of being conditionally rendered:
                the container's height is the taller of the two, so toggling modes
                never resizes or jumps the card, it only cross-fades content. */}
            <div className="glass-card rounded-card overflow-hidden grid grid-cols-1">
            <div className={`col-start-1 row-start-1 p-5 sm:p-6 transition-opacity duration-150 ${
              mode === "once" ? "opacity-100" : "invisible opacity-0 pointer-events-none"
            }`}>
                {!onceMulti ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-text-primary mb-1">Pay someone</h2>
                  <p className="text-text-secondary/50 text-xs">
                    Enter a Woosh username or a wallet address.
                  </p>
                </div>
                <Input
                  id="recipient"
                  value={value}
                  onChange={(e) => { setValue(e.target.value); setSingleError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSingleSubmit(); }}
                  placeholder="username or 0x…"
                  error={singleError}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    setOnceMulti(true);
                    setOnceRows(value.trim() ? [{ to: value.trim(), amount: "" }, { to: "", amount: "" }] : emptyRows());
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-input border border-dashed border-white/[0.14] py-2.5 text-sm font-medium text-text-secondary/50 hover:text-blue-primary hover:border-blue-primary/30 hover:bg-blue-primary/[0.04] transition-colors"
                >
                  <span className="text-base leading-none">+</span> Add recipient
                </button>
                <Button onClick={handleSingleSubmit} disabled={!value.trim() || checking}>
                  {checking ? "Checking…" : "Continue"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-text-primary mb-1">Pay several people</h2>
                    <p className="text-text-secondary/50 text-xs">One PIN, everyone gets paid right now.</p>
                  </div>
                </div>
                <RecipientRows rows={onceRows} onChange={setOnceRows} minRows={1} maxRows={20} />
                <Field label="Memo (optional)" htmlFor="once-memo">
                  <input
                    id="once-memo"
                    type="text"
                    value={onceMemo}
                    onChange={(e) => setOnceMemo(e.target.value)}
                    placeholder="What's this for?"
                    className={FIELD_CLS}
                  />
                </Field>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-text-secondary/40">Total</span>
                  <span className="font-mono text-sm font-semibold text-text-primary tabular-nums">
                    {fmtWei(onceTotalWei)} USDC
                  </span>
                </div>
                {onceError && <p className="text-sm text-red-400">{onceError}</p>}
                <Button onClick={startOnceBatch}>
                  {onceRows.length > 1 ? `Send to ${onceRows.length} people` : "Send"}
                </Button>
              </div>
            )}
            </div>

            {/* ── Recurring ──────────────────────────────────────────────────── */}
            <div className={`col-start-1 row-start-1 p-5 sm:p-6 transition-opacity duration-150 ${
              mode === "recurring" ? "opacity-100" : "invisible opacity-0 pointer-events-none"
            }`}>
                {!recurringMulti ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-text-primary mb-1">Recurring payment</h2>
                  <p className="text-text-secondary/50 text-xs">
                    Funded once, held onchain, paid out on schedule.
                  </p>
                </div>
                <Field label="Pay to" htmlFor="recurring-recipient">
                  <input
                    id="recurring-recipient"
                    type="text"
                    value={recipient}
                    onChange={(e) => { setRecipient(e.target.value); setRecurringError(null); }}
                    placeholder="username or 0x address"
                    className={FIELD_CLS}
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => {
                    setRecurringMulti(true);
                    setPayrollRows(recipient.trim() ? [{ to: recipient.trim(), amount: amount.trim() }, { to: "", amount: "" }] : emptyRows());
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-input border border-dashed border-white/[0.14] py-2.5 text-sm font-medium text-text-secondary/50 hover:text-blue-primary hover:border-blue-primary/30 hover:bg-blue-primary/[0.04] transition-colors"
                >
                  <span className="text-base leading-none">+</span> Add recipient
                </button>
                <Field label="Amount per payment" htmlFor="recurring-amount">
                  <div className="relative">
                    <input
                      id="recurring-amount"
                      type="number"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setRecurringError(null); }}
                      placeholder="0.00"
                      className={`${FIELD_CLS} pr-16`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">USDC</span>
                  </div>
                </Field>
                <RecurringScheduleFields
                  interval={interval}
                  onIntervalChange={setInterval}
                  periods={periods}
                  onPeriodsChange={(v) => { setPeriods(v); setRecurringError(null); }}
                  funding={funding}
                  onFundingChange={(v) => { setFunding(v); setRecurringError(null); }}
                  suggestedFunding={recurringSuggestedFunding}
                />
                {amount.trim() && (
                  <div className="rounded-input bg-blue-primary/[0.06] border border-blue-primary/15 px-4 py-3">
                    <p className="text-sm text-text-primary font-medium">
                      Pay {amount} USDC {recurringCadence}{recipient.trim() ? ` to ${recipient.trim()}` : ""}
                    </p>
                    <p className="text-xs text-text-secondary/50 mt-1">
                      {recurringRuns > 0
                        ? `${recurringRuns} run${recurringRuns > 1 ? "s" : ""}${funding.trim() ? ` · ${funding} USDC deposit` : ""}`
                        : "Runs until the deposit runs out"}
                    </p>
                  </div>
                )}
                {recurringError && <p className="text-sm text-red-400">{recurringError}</p>}
                <Button onClick={startRecurringSingle}>Create recurring payment</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-text-primary mb-1">Payroll</h2>
                  <p className="text-text-secondary/50 text-xs">
                    Pay 2 to 10 people the same amounts, on the same schedule, automatically.
                  </p>
                </div>
                <RecipientRows rows={payrollRows} onChange={setPayrollRows} maxRows={10} />
                <Field label="Memo (optional)" htmlFor="payroll-memo">
                  <input
                    id="payroll-memo"
                    type="text"
                    value={payrollMemo}
                    onChange={(e) => setPayrollMemo(e.target.value)}
                    placeholder="What's this for?"
                    className={FIELD_CLS}
                  />
                </Field>
                <RecurringScheduleFields
                  interval={payrollInterval}
                  onIntervalChange={setPayrollInterval}
                  periods={payrollPeriods}
                  onPeriodsChange={(v) => { setPayrollPeriods(v); setPayrollError(null); }}
                  funding={payrollFunding}
                  onFundingChange={(v) => { setPayrollFunding(v); setPayrollError(null); }}
                  suggestedFunding={payrollSuggestedFunding}
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-text-secondary/40">Per run</span>
                  <span className="font-mono text-sm font-semibold text-text-primary tabular-nums">
                    {fmtWei(payrollTotalWei)} USDC
                  </span>
                </div>
                {payrollError && <p className="text-sm text-red-400">{payrollError}</p>}
                <Button onClick={startPayroll}>Create payroll ({payrollRows.length})</Button>
                <button
                  onClick={() => { setRecurringMulti(false); setPayrollError(null); }}
                  className="w-full text-center text-xs text-text-secondary/40 hover:text-text-secondary transition-colors"
                >
                  Just one recipient instead
                </button>
              </div>
            )}
            </div>
            </div>
          </div>

          {/* ── Recurring payments already running ────────────────────────────
              Shown regardless of Once/Recurring mode: it reflects payments that
              already exist, not the form currently in view, so the right column
              never sits empty while you're on the Once tab. Header row uses the same
              min-height + mb-6 as the left column's PageHeader row so the two cards'
              top edges align on a shared baseline. */}
          <div className="mt-8 lg:mt-0">
            <div className="mb-6 min-h-[2.25rem] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">Your recurring payments</h2>
              <RefreshButton onRefresh={handleRefresh} isRefreshing={isRefreshing} />
            </div>
            {strategiesLoading ? (
              // Same min-height and border treatment as the empty/error states below,
              // so finishing a load never visibly resizes the card.
              <div className="rounded-card border border-white/[0.05] p-6 min-h-[220px] space-y-3">
                <div className="h-4 w-40 bg-border rounded animate-pulse" />
                <div className="h-3 w-full bg-border/60 rounded animate-pulse" />
                <div className="h-3 w-2/3 bg-border/60 rounded animate-pulse" />
              </div>
            ) : strategiesError ? (
              <EmptyState
                glyph="!"
                primary="Couldn't load your recurring payments."
                secondary="There was a problem reading from the network. Try again in a moment."
                className="rounded-card border border-white/[0.05] p-6 text-center min-h-[220px] flex flex-col items-center justify-center"
              />
            ) : active.length === 0 && closed.length === 0 ? (
              <EmptyState
                glyph="↻"
                primary="No recurring payments yet."
                secondary="Set one up on the left, a fixed amount to one person or a payroll to several, on a schedule."
                className="rounded-card border border-white/[0.05] p-6 text-center min-h-[220px] flex flex-col items-center justify-center"
              />
            ) : (
              <div>
                {active.length > 0 && (
                  <div className="space-y-3 mb-6">
                    {/* TODO: OnchainStrategy has no batch-leg data, a payroll strategy just
                        shows "Payroll" here. Showing "Payroll (N recipients)" needs a new
                        entity read (e.g. getBatchLegs(id)) against WooshStrategyRegistry,
                        out of scope for this pass. */}
                    {active.map((s) => (
                      <RecurringCard
                        key={s.id}
                        s={s}
                        target={s.recipient === null ? "Payroll" : short(s.recipient)}
                        accent="text-blue-primary"
                        onAction={(action) => setPendingStrategy({ strategy: s, action })}
                      />
                    ))}
                  </div>
                )}
                {closed.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary/30 mb-3 px-1">
                      Past
                    </p>
                    <div className="glass-card rounded-card px-4">
                      {closed.map((s) => (
                        <RecurringPastRow
                          key={s.id}
                          s={s}
                          target={s.recipient === null ? "Payroll" : short(s.recipient)}
                          accent="text-blue-primary"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />

      {/* Once — batch confirm */}
      {onceConfirm && (
        <ConfirmActionModal
          session={session}
          icon="→"
          title="Send to everyone"
          subtitle="One PIN sends every leg right now."
          summary={
            <div className="rounded-input bg-blue-primary/[0.06] border border-blue-primary/15 px-4 py-3 space-y-1">
              {onceRows.map((r, i) => (
                <p key={i} className="text-sm text-text-primary flex items-center justify-between gap-3">
                  <span className="truncate">{r.to.trim()}</span>
                  <span className="font-mono shrink-0">{r.amount.trim()} USDC</span>
                </p>
              ))}
            </div>
          }
          authIntro="We need to verify you to send this payment."
          cta={`Send ${fmtWei(onceTotalWei)} USDC`}
          successTitle="Sent"
          successBody="Everyone on the list has been paid."
          request={(userToken) =>
            fetch("/api/wallet/batch-pay", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userToken,
                legs: onceRows.map((r) => ({ to: r.to.trim(), amount: r.amount.trim() })),
                memo: onceMemo.trim(),
              }),
            })
          }
          onClose={() => setOnceConfirm(false)}
          onSuccess={() => {
            setOnceRows(emptyRows());
            setOnceMemo("");
            setOnceMulti(false);
            setValue("");
          }}
        />
      )}

      {/* Recurring — single confirm */}
      {recurringConfirm && (
        <ConfirmActionModal
          session={session}
          icon="↻"
          title="New recurring payment"
          subtitle="A fixed amount to one person, funded once and paid out on autopilot."
          summary={
            <div className="rounded-input bg-blue-primary/[0.06] border border-blue-primary/15 px-4 py-3">
              <p className="text-sm text-text-primary font-medium">
                Pay {amount} USDC {recurringCadence} to {recipient.trim()}
              </p>
              <p className="text-xs text-text-secondary/50 mt-1">
                {recurringRuns > 0
                  ? `${recurringRuns} run${recurringRuns > 1 ? "s" : ""} · ${funding.trim()} USDC deposit`
                  : `Runs until the ${funding.trim()} USDC deposit runs out`}
              </p>
            </div>
          }
          authIntro="We need to verify you to fund the payment onchain."
          cta="Create recurring payment"
          successTitle="Recurring payment created"
          successBody="It is funded and scheduled. It runs automatically."
          request={(userToken) =>
            fetch("/api/wallet/create-strategy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userToken,
                salt: saltRef.current,
                kind: "payment",
                recipient: recipient.trim(),
                amountPerPeriod: amount.trim(),
                intervalSeconds: interval,
                periodsTotal: periods.trim() === "" ? 0 : Number(periods),
                funding: funding.trim(),
              }),
            })
          }
          onClose={() => setRecurringConfirm(false)}
          onSuccess={() => {
            setRecipient("");
            setAmount("");
            setPeriods("");
            setFunding("");
            void refetch();
          }}
        />
      )}

      {/* Recurring — payroll confirm */}
      {payrollConfirm && (
        <ConfirmActionModal
          session={session}
          icon="↻"
          title="New payroll"
          subtitle={`${payrollRows.length} recipients, funded once and paid out on autopilot.`}
          summary={
            <div className="rounded-input bg-blue-primary/[0.06] border border-blue-primary/15 px-4 py-3 space-y-1">
              {payrollRows.map((r, i) => (
                <p key={i} className="text-sm text-text-primary flex items-center justify-between gap-3">
                  <span className="truncate">{r.to.trim()}</span>
                  <span className="font-mono shrink-0">{r.amount.trim()} USDC</span>
                </p>
              ))}
              <p className="text-xs text-text-secondary/50 pt-1">
                {payrollRuns > 0
                  ? `${payrollRuns} run${payrollRuns > 1 ? "s" : ""} · ${payrollFunding.trim()} USDC deposit`
                  : `Runs until the ${payrollFunding.trim()} USDC deposit runs out`}
              </p>
            </div>
          }
          authIntro="We need to verify you to fund payroll onchain."
          cta="Create payroll"
          successTitle="Payroll created"
          successBody="It is funded and scheduled. It runs automatically."
          request={(userToken) =>
            fetch("/api/wallet/create-batch-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userToken,
                salt: saltRef.current,
                legs: payrollRows.map((r) => ({ to: r.to.trim(), amount: r.amount.trim() })),
                memo: payrollMemo.trim(),
                intervalSeconds: payrollInterval,
                periodsTotal: payrollPeriods.trim() === "" ? 0 : Number(payrollPeriods),
                funding: payrollFunding.trim(),
              }),
            })
          }
          onClose={() => setPayrollConfirm(false)}
          onSuccess={() => {
            setPayrollRows(emptyRows());
            setPayrollMemo("");
            setPayrollPeriods("");
            setPayrollFunding("");
            setRecurringMulti(false);
            void refetch();
          }}
        />
      )}

      {pendingStrategy && (
        <StrategyActionModal
          session={session}
          strategy={pendingStrategy.strategy}
          action={pendingStrategy.action}
          onClose={() => setPendingStrategy(null)}
          onDone={refetch}
          noun="payment"
        />
      )}
    </main>
  );
}
