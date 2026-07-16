"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits, formatUnits } from "viem";
import AppHeader from "@/widgets/AppHeader/ui/AppHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { Button } from "@/shared/ui/Button";
import { Modal } from "@/shared/ui/Modal";
import { EmptyState } from "@/shared/ui/EmptyState";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { FIELD_CLS, LABEL_CLS } from "@/shared/ui/Field";
import { RecurringScheduleFields } from "@/shared/ui/RecurringScheduleFields";
import { RecurringCard, RecurringPastRow } from "@/shared/ui/RecurringCard";
import { ConfirmActionModal } from "@/features/auth/ui/ConfirmActionModal";
import StrategyActionModal, { type StrategyAction } from "@/widgets/CreateStrategyModal/ui/StrategyActionModal";
import { useChallengeFlow } from "@/features/auth/model/useChallengeFlow";
import { useTokenBalances } from "@/entities/wallet/hooks/useTokenBalances";
import { getSession as loadSession, getCachedTokens } from "@/shared/lib/session";
import { useMyStrategies } from "@/entities/strategy/hooks/useMyStrategies";
import { INTERVAL_PRESETS } from "@/entities/strategy/lib/format";
import { newStrategySalt } from "@/entities/strategy/lib/computeStrategyId";
import { AMOUNT_RE as RECURRING_AMOUNT_RE, isValidAmount } from "@/shared/lib/amount";
import { SWAP_TARGETS, tokenByAddress } from "@/shared/lib/tokens";
import type { OnchainStrategy } from "@/entities/strategy/model/types";
import type { Session } from "@/entities/user/model/types";

const AMOUNT_RE = /^\d+(\.\d{1,8})?$/;
const GAS_RESERVE = 0.1;
const PERCENTS = [25, 50, 100] as const;
const SLIPPAGE_OPTIONS = [0.1, 1, 5, 15];

type Mode = "once" | "recurring";

function TokenBadge({ symbol }: { symbol: string }) {
  const isCircBTC = symbol === "cirBTC";
  const isUSDC = symbol === "USDC";
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide ${
      isCircBTC ? "bg-amber-400/10 text-amber-400" :
      isUSDC ? "bg-blue-primary/10 text-blue-primary" :
      "bg-cyan-400/10 text-cyan-400"
    }`}>
      <span className="opacity-70">{isCircBTC ? "₿" : isUSDC ? "$" : "€"}</span>
      {symbol}
    </span>
  );
}

export default function SwapPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>("once");

  const swapTargets = SWAP_TARGETS.filter((t) => t.address);
  const [token, setToken] = useState<string>(swapTargets[0]?.symbol ?? "EURC");
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<{ loading: boolean; out?: string; error?: string }>({ loading: false });
  const [formError, setFormError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [slippage, setSlippage] = useState(1);
  const [result, setResult] = useState<{ amountOut: string; tokenOut: string } | null>(null);
  const [failure, setFailure] = useState<{ tokenIn: string; refunded: boolean } | null>(null);

  // Recurring auto-buy (DCA)
  const [dcaToken, setDcaToken] = useState<string>(swapTargets[0]?.address ?? "");
  const [dcaAmount, setDcaAmount] = useState("");
  const [dcaInterval, setDcaInterval] = useState(INTERVAL_PRESETS[0].seconds);
  const [dcaPeriods, setDcaPeriods] = useState("");
  const [dcaFunding, setDcaFunding] = useState("");
  const [dcaError, setDcaError] = useState<string | null>(null);
  const [dcaConfirm, setDcaConfirm] = useState(false);
  const saltRef = useRef<string>("");
  const [pendingStrategy, setPendingStrategy] = useState<{ strategy: OnchainStrategy; action: StrategyAction } | null>(null);

  const { strategies: allStrategies, loading: strategiesLoading, refetch } = useMyStrategies(session?.walletAddress);
  const dcaStrategies = allStrategies.filter((s) => s.kind === "swap");
  const activeDca = dcaStrategies.filter((s) => s.status === "active" || s.status === "paused" || s.status === "depleted");
  const closedDca = dcaStrategies.filter((s) => s.status === "completed" || s.status === "cancelled");

  const tokenIn = direction === "buy" ? "USDC" : token;
  const tokenOut = direction === "buy" ? token : "USDC";

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/signup"); return; }
    setSession(s);
  }, [router]);

  const { data: holdings, refetch: refetchBalances } = useTokenBalances(session?.walletAddress);
  const balanceNum = useMemo(() => {
    const h = holdings?.tokens.find((t) => t.symbol === tokenIn);
    return h ? parseFloat(h.amount) : 0;
  }, [holdings, tokenIn]);
  const spendable = tokenIn === "USDC" ? Math.max(balanceNum - GAS_RESERVE, 0) : balanceNum;

  const flow = useChallengeFlow({
    prefillEmail: session?.email,
    request: (userToken) =>
      fetch("/api/wallet/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken, tokenIn, tokenOut, amount: amount.trim() }),
      }),
    onSuccess: () => { void runExecute(); },
  });

  async function runExecute() {
    const tokens = getCachedTokens();
    if (!tokens) { setFormError("Session expired. Please try again."); return; }
    setSwapping(true);
    setFormError(null);

    const ac = new AbortController();
    // Synthra API + approve tx + swap tx can take up to ~110s total. Give a generous buffer.
    const timer = setTimeout(() => ac.abort(), 130_000);

    try {
      const res = await fetch("/api/wallet/swap/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken: tokens.userToken, tokenIn, tokenOut, amount: amount.trim(), slippage }),
        signal: ac.signal,
      });
      const data = (await res.json()) as { ok?: boolean; amountOut?: string; tokenOut?: string; exact?: boolean; error?: string; refunded?: boolean };
      if (!res.ok || !data.ok) {
        if (data.refunded) {
          setFailure({ tokenIn, refunded: true });
        } else {
          setFormError(data.error ?? "Swap failed. Please try again.");
        }
        return;
      }
      setAmount("");
      setQuote({ loading: false });
      const outLabel = data.amountOut ? (data.exact ? data.amountOut : `≈${data.amountOut}`) : "-";
      setResult({ amountOut: outLabel, tokenOut: data.tokenOut ?? tokenOut });
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["token-balances", session?.walletAddress] });
        void refetchBalances();
      }, 3_000);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        setFailure({ tokenIn, refunded: false });
      } else {
        setFormError("Network error. Please try again.");
      }
    } finally {
      clearTimeout(timer);
      setSwapping(false);
    }
  }

  const quoteSeq = useRef(0);
  useEffect(() => {
    const a = amount.trim();
    if (!AMOUNT_RE.test(a) || parseFloat(a) <= 0) { setQuote({ loading: false }); return; }
    const seq = ++quoteSeq.current;
    setQuote({ loading: true });
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/wallet/swap/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenIn, tokenOut, amount: a }),
        });
        const data = (await res.json()) as { ok?: boolean; estimatedOutput?: string; error?: string };
        if (seq !== quoteSeq.current) return;
        if (!res.ok || !data.ok) { setQuote({ loading: false, error: "No route right now" }); return; }
        setQuote({ loading: false, out: data.estimatedOutput });
      } catch {
        if (seq === quoteSeq.current) setQuote({ loading: false, error: "Quote unavailable" });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [amount, tokenIn, tokenOut]);

  // Keep auth.email in sync with session email so the flow's OTP auto-send sees a
  // non-empty value. The auto-send itself lives in useChallengeFlow.
  useEffect(() => {
    if (session?.email) flow.auth.setEmail(session.email);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.email]);

  function setPercent(pct: number) {
    if (spendable <= 0) return;
    const raw = pct === 100 ? spendable : Math.min((balanceNum * pct) / 100, spendable);
    const v = Math.floor(raw * 1e6) / 1e6;
    setAmount(v > 0 ? String(v) : "");
    setFormError(null);
  }

  function flipDirection() {
    setDirection((d) => (d === "buy" ? "sell" : "buy"));
    setAmount("");
    setQuote({ loading: false });
    setFormError(null);
    setFailure(null);
  }

  function selectToken(sym: string) {
    setToken(sym);
    setAmount("");
    setQuote({ loading: false });
    setFormError(null);
    setFailure(null);
  }

  const amountNum = parseFloat(amount);
  const validAmount = AMOUNT_RE.test(amount.trim()) && amountNum > 0;
  const exceeds = validAmount && amountNum > spendable + 1e-9;
  const busy = flow.phase === "auth" || flow.phase === "running" || swapping;
  const canSubmit = validAmount && !exceeds && !!quote.out && !busy;

  function startSwap() {
    if (!validAmount) { setFormError("Enter a valid amount"); return; }
    if (exceeds) { setFormError(`Amount exceeds your ${tokenIn} balance`); return; }
    setFormError(null);
    setFailure(null);
    flow.start();
  }

  const dcaCadence = INTERVAL_PRESETS.find((p) => p.seconds === dcaInterval)?.label.toLowerCase() ?? "";
  const dcaRuns = dcaPeriods.trim() === "" ? 0 : Number(dcaPeriods);
  const dcaSuggestedFunding =
    isValidAmount(dcaAmount) && Number.isInteger(dcaRuns) && dcaRuns > 0
      ? formatUnits(parseUnits(dcaAmount.trim(), 18) * BigInt(dcaRuns), 18).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")
      : "";
  const dcaTokenSymbol = swapTargets.find((t) => t.address === dcaToken)?.symbol;

  function startDca() {
    const a = dcaAmount.trim();
    const f = dcaFunding.trim();
    if (!dcaToken) { setDcaError("Pick a token to buy"); return; }
    if (!RECURRING_AMOUNT_RE.test(a) || parseFloat(a) <= 0) { setDcaError("Enter a valid amount per run"); return; }
    if (dcaPeriods.trim() !== "" && (!/^\d+$/.test(dcaPeriods.trim()) || Number(dcaPeriods) < 1)) {
      setDcaError("Number of runs must be a whole number, or leave it empty");
      return;
    }
    if (!RECURRING_AMOUNT_RE.test(f) || parseFloat(f) < parseFloat(a)) { setDcaError("Total to deposit must be at least one run"); return; }
    setDcaError(null);
    saltRef.current = newStrategySalt();
    setDcaConfirm(true);
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-navy flex items-center justify-center">
        <span className="shimmer-text text-sm font-medium">Loading…</span>
      </main>
    );
  }

  const error = formError ?? flow.error;
  const balanceFmt = balanceNum > 0
    ? balanceNum.toLocaleString(undefined, { maximumFractionDigits: 8 })
    : "0";

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <AppHeader />

      {/* Success modal */}
      {result && (
        <Modal onClose={() => setResult(null)} size="sm">
          <div className="py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-green-400/10 border border-green-400/20 flex items-center justify-center mx-auto mb-4 text-2xl text-green-400">✓</div>
            <h2 className="text-lg font-bold text-text-primary mb-1">Swap complete</h2>
            <p className="text-text-secondary text-sm">
              You received{" "}
              <span className="text-text-primary font-semibold">{result.amountOut} {result.tokenOut}</span>.
            </p>
            <Button onClick={() => setResult(null)} className="mt-6 w-full">
              Done
            </Button>
          </div>
        </Modal>
      )}

      <div className="flex-1 flex flex-col sm:items-center sm:justify-start sm:py-10 sm:px-4">
        <div className="w-full sm:max-w-md">

          {/* Page header */}
          <div className="px-5 pt-7 pb-5 sm:px-0 sm:mb-4 text-center">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Swap</h1>
          </div>

          <div className="px-5 sm:px-0 mb-5">
            <SegmentedControl
              aria-label="Swap mode"
              options={[
                { value: "once" as Mode, label: "Once", glyph: "⇄" },
                { value: "recurring" as Mode, label: "Recurring", glyph: "↻" },
              ]}
              value={mode}
              onChange={setMode}
            />
          </div>

          {/* ── Once — the existing one-off swap card, untouched internals ──── */}
          {mode === "once" && (
            <div className="sm:glass-card sm:rounded-card sm:overflow-hidden">
              <div className="px-4 pb-6 sm:px-6 sm:pt-6">
                <div className="space-y-2 transition-opacity duration-200">
                  <div className={`space-y-2 transition-opacity duration-200 ${busy ? "opacity-40 pointer-events-none" : ""}`}>

                  {/* Alt-token tabs */}
                  <div className="flex gap-2 pb-2">
                    {swapTargets.map((t) => {
                      const active = token === t.symbol;
                      const isCircBTC = t.symbol === "cirBTC";
                      return (
                        <button
                          key={t.symbol}
                          onClick={() => selectToken(t.symbol)}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-input text-sm font-semibold transition-all ${
                            active
                              ? isCircBTC
                                ? "bg-amber-400/10 text-amber-400 border border-amber-400/20"
                                : "bg-cyan-400/10 text-cyan-400 border border-cyan-400/20"
                              : "bg-white/[0.04] text-text-secondary/50 border border-transparent hover:text-text-secondary"
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${
                            isCircBTC ? "bg-amber-400/15 text-amber-400" : "bg-cyan-400/15 text-cyan-400"
                          }`}>
                            {isCircBTC ? "₿" : "€"}
                          </span>
                          {t.symbol}
                        </button>
                      );
                    })}
                  </div>

                  {/* FROM panel */}
                  <div className="rounded-card bg-white/[0.04] border border-white/[0.07] px-4 pt-4 pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-text-secondary/50 font-medium uppercase tracking-widest">You pay</span>
                      <TokenBadge symbol={tokenIn} />
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setFormError(null); setFailure(null); }}
                      placeholder="0"
                      autoFocus
                      className="w-full bg-transparent text-4xl font-light text-text-primary outline-none placeholder:text-text-secondary/15 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-text-secondary/40">
                        {balanceFmt} {tokenIn} available
                      </span>
                      <div className="flex gap-1.5">
                        {PERCENTS.map((p) => (
                          <button
                            key={p}
                            onClick={() => setPercent(p)}
                            disabled={spendable <= 0}
                            className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/[0.05] text-text-secondary/50 hover:text-text-primary hover:bg-white/[0.1] disabled:opacity-25 transition-colors"
                          >
                            {p === 100 ? "Max" : `${p}%`}
                          </button>
                        ))}
                      </div>
                    </div>
                    {tokenIn === "USDC" && spendable < balanceNum && (
                      <p className="text-xs text-text-secondary/30 mt-1.5">
                        ${GAS_RESERVE.toFixed(2)} reserved for gas
                      </p>
                    )}
                  </div>

                  {/* Flip button */}
                  <div className="flex justify-center relative z-10 -my-0.5">
                    <button
                      onClick={flipDirection}
                      aria-label="Flip swap direction"
                      className="w-9 h-9 rounded-full bg-navy border border-white/[0.12] flex items-center justify-center text-text-secondary/50 hover:text-blue-primary hover:border-blue-primary/30 hover:bg-blue-primary/5 transition-all"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 1v12M3.5 4L7 1l3.5 3M3.5 10L7 13l3.5-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>

                  {/* TO panel */}
                  <div className={`rounded-card bg-white/[0.04] border px-4 pt-4 pb-3 transition-colors ${
                    quote.out ? "border-blue-primary/15" : "border-white/[0.07]"
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-text-secondary/50 font-medium uppercase tracking-widest">You receive</span>
                      <TokenBadge symbol={tokenOut} />
                    </div>
                    <div className="text-4xl font-light min-h-[48px] flex items-center">
                      {quote.loading ? (
                        <span className="text-base text-text-secondary/30">estimating…</span>
                      ) : quote.out ? (
                        <span className="text-text-primary">≈ {quote.out}</span>
                      ) : (
                        <span className="text-text-secondary/15">0</span>
                      )}
                    </div>
                    {/* USDC equivalent: shown when buying a non-USDC token */}
                    {quote.out && tokenIn === "USDC" && validAmount && (
                      <p className="text-xs text-text-secondary/35 mt-1">≈ {amount} USDC</p>
                    )}
                    {quote.error && (
                      <p className="text-xs text-amber-400/60 mt-1">{quote.error}</p>
                    )}
                  </div>

                  {/* Slippage selector — highlighted after a refunded failure, since the
                      error banner points the user here to raise tolerance and retry */}
                  <div className={`flex items-center gap-2 pt-1 transition-all ${
                    failure?.refunded ? "rounded-lg ring-1 ring-amber-400/25 bg-amber-400/[0.03] px-2 py-1.5 -mx-2" : ""
                  }`}>
                    <span className={`text-xs shrink-0 ${failure?.refunded ? "text-amber-400/70" : "text-text-secondary/40"}`}>Slippage</span>
                    <div className="flex gap-1.5 flex-1">
                      {SLIPPAGE_OPTIONS.map((pct) => (
                        <button
                          key={pct}
                          onClick={() => setSlippage(pct)}
                          className={`flex-1 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                            slippage === pct
                              ? "bg-blue-primary/15 text-blue-primary border border-blue-primary/30"
                              : "bg-white/[0.04] text-text-secondary/40 border border-transparent hover:text-text-secondary/70"
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && !busy && (
                    <p className="text-sm text-red-400/80 text-center pt-1">{error}</p>
                  )}

                  </div>{/* end dimmed form controls */}

                  <div className="pt-2 space-y-2">
                    {/* Inline failure banner. No controls here: slippage lives in the
                        form above, retry is the main action button below. */}
                    {failure && !busy && (
                      <div className="rounded-card border border-red-400/20 bg-red-400/[0.04] px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <span className="text-red-400 text-sm leading-5 mt-px">✕</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-text-primary leading-5">Swap failed</p>
                            <p className="text-xs text-text-secondary/60 mt-0.5">
                              {failure.refunded
                                ? `Your ${failure.tokenIn} was refunded, nothing was lost. Try a higher slippage tolerance above, then swap again.`
                                : `The swap timed out. Check your balance, your ${failure.tokenIn} may have been refunded or the swap may still complete.`}
                            </p>
                          </div>
                          <button
                            onClick={() => setFailure(null)}
                            aria-label="Dismiss"
                            className="shrink-0 -mt-0.5 -mr-1 p-1 text-text-secondary/30 hover:text-text-secondary/70 transition-colors"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Status / action row */}
                    {swapping ? (
                      <div className="py-3 text-center">
                        <span className="shimmer-text text-sm font-medium">Swapping via Synthra…</span>
                      </div>
                    ) : flow.phase === "running" ? (
                      <div className="py-3 text-center space-y-2">
                        <span className="shimmer-text text-sm font-medium">Confirm in the PIN window…</span>
                        <div>
                          <button
                            onClick={flow.cancel}
                            className="text-xs text-text-secondary/30 hover:text-text-secondary/60 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : flow.phase === "auth" ? (
                      <div className="py-3 text-center space-y-2">
                        <span className="shimmer-text text-sm font-medium">
                          {flow.auth.step === "email"
                            ? (flow.auth.deviceIdLoading ? "Initializing…" : "Sending verification code…")
                            : `Enter the code from ${flow.auth.email || session?.email}…`}
                        </span>
                        {flow.auth.error && (
                          <p className="text-xs text-red-400/80">{flow.auth.error}</p>
                        )}
                        <div>
                          <button
                            onClick={flow.backToIdle}
                            className="text-xs text-text-secondary/30 hover:text-text-secondary/60 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <Button onClick={startSwap} disabled={!canSubmit}>
                        {failure ? "Try again" : `Swap ${tokenIn} → ${tokenOut}`}
                      </Button>
                    )}
                  </div>

                  <p className="text-xs text-text-secondary/25 text-center pt-1">
                    Routed via Synthra DEX
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Recurring — DCA auto-buy ─────────────────────────────────────── */}
          {mode === "recurring" && (
            <div className="glass-card rounded-card p-5 sm:p-6 mb-8 mx-4 sm:mx-0">
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-text-primary mb-1">Auto-buy (DCA)</h2>
                  <p className="text-text-secondary/50 text-xs">
                    Funded once, converts USDC into your target token on schedule.
                  </p>
                </div>

                <div>
                  <span className={LABEL_CLS}>Buy</span>
                  <div className="grid grid-cols-2 gap-2">
                    {swapTargets.length === 0 && (
                      <p className="col-span-2 text-xs text-text-secondary/50">No tokens configured</p>
                    )}
                    {swapTargets.map((t) => {
                      const active = dcaToken === t.address;
                      const g = t.symbol === "cirBTC" ? "₿" : "€";
                      return (
                        <button
                          key={t.symbol}
                          aria-pressed={active}
                          onClick={() => { setDcaToken(t.address ?? ""); setDcaError(null); }}
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

                <div>
                  <span className={LABEL_CLS}>Spend per run</span>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={dcaAmount}
                      onChange={(e) => { setDcaAmount(e.target.value); setDcaError(null); }}
                      placeholder="0.00"
                      className={`${FIELD_CLS} pr-16`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">USDC</span>
                  </div>
                </div>

                <RecurringScheduleFields
                  interval={dcaInterval}
                  onIntervalChange={setDcaInterval}
                  periods={dcaPeriods}
                  onPeriodsChange={(v) => { setDcaPeriods(v); setDcaError(null); }}
                  funding={dcaFunding}
                  onFundingChange={(v) => { setDcaFunding(v); setDcaError(null); }}
                  suggestedFunding={dcaSuggestedFunding}
                />

                {dcaAmount.trim() && (
                  <div className="rounded-input bg-blue-primary/[0.06] border border-blue-primary/15 px-4 py-3">
                    <p className="text-sm text-text-primary font-medium">
                      Buy {dcaTokenSymbol ?? "token"} with {dcaAmount} USDC {dcaCadence}
                    </p>
                    <p className="text-xs text-text-secondary/50 mt-1">
                      {dcaRuns > 0
                        ? `${dcaRuns} run${dcaRuns > 1 ? "s" : ""}${dcaFunding.trim() ? ` · ${dcaFunding} USDC deposit` : ""}`
                        : "Runs until the deposit runs out"}
                    </p>
                  </div>
                )}

                {dcaError && <p className="text-sm text-red-400">{dcaError}</p>}
                <Button onClick={startDca}>Create auto-buy</Button>
              </div>
            </div>
          )}

          {/* ── Auto-buys already running ────────────────────────────────────── */}
          {mode === "recurring" && (
            <div className="px-4 sm:px-0">
              <h2 className="text-sm font-semibold text-text-primary mb-3">Your auto-buys</h2>
              {strategiesLoading ? (
                <div className="glass-card rounded-card p-4">
                  <div className="h-4 w-40 bg-border rounded animate-pulse mb-3" />
                  <div className="h-3 w-full bg-border/60 rounded animate-pulse" />
                </div>
              ) : activeDca.length === 0 && closedDca.length === 0 ? (
                <EmptyState
                  glyph="↻"
                  primary="No auto-buys yet."
                  secondary="Set one up above, USDC converted into EURC or cirBTC on a schedule."
                  className="glass-card rounded-card p-6 text-center"
                />
              ) : (
                <div>
                  {activeDca.length > 0 && (
                    <div className="space-y-3 mb-6">
                      {activeDca.map((s) => {
                        const symbol = tokenByAddress(s.tokenOut)?.symbol;
                        const accent = symbol === "cirBTC" ? "text-amber-400" : "text-cyan-400";
                        return (
                          <RecurringCard
                            key={s.id}
                            s={s}
                            target={symbol ?? "token"}
                            accent={accent}
                            onAction={(action) => setPendingStrategy({ strategy: s, action })}
                          />
                        );
                      })}
                    </div>
                  )}
                  {closedDca.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary/30 mb-3 px-1">
                        Past
                      </p>
                      <div className="glass-card rounded-card px-4">
                        {closedDca.map((s) => {
                          const symbol = tokenByAddress(s.tokenOut)?.symbol;
                          const accent = symbol === "cirBTC" ? "text-amber-400" : "text-cyan-400";
                          return <RecurringPastRow key={s.id} s={s} target={symbol ?? "token"} accent={accent} />;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Footer />

      {dcaConfirm && (
        <ConfirmActionModal
          session={session}
          icon="↻"
          title="New auto-buy"
          subtitle="DCA into a token, funded once and run on autopilot."
          summary={
            <div className="rounded-input bg-blue-primary/[0.06] border border-blue-primary/15 px-4 py-3">
              <p className="text-sm text-text-primary font-medium">
                Buy {dcaTokenSymbol ?? "token"} with {dcaAmount} USDC {dcaCadence}
              </p>
              <p className="text-xs text-text-secondary/50 mt-1">
                {dcaRuns > 0
                  ? `${dcaRuns} run${dcaRuns > 1 ? "s" : ""} · ${dcaFunding.trim()} USDC deposit`
                  : `Runs until the ${dcaFunding.trim()} USDC deposit runs out`}
              </p>
            </div>
          }
          authIntro="We need to verify you to fund the auto-buy onchain."
          cta="Create auto-buy"
          successTitle="Auto-buy created"
          successBody="It is funded and scheduled. It runs automatically."
          request={(userToken) =>
            fetch("/api/wallet/create-strategy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userToken,
                salt: saltRef.current,
                kind: "swap",
                tokenOut: dcaToken,
                amountPerPeriod: dcaAmount.trim(),
                intervalSeconds: dcaInterval,
                periodsTotal: dcaPeriods.trim() === "" ? 0 : Number(dcaPeriods),
                funding: dcaFunding.trim(),
              }),
            })
          }
          onClose={() => setDcaConfirm(false)}
          onSuccess={() => {
            setDcaAmount("");
            setDcaPeriods("");
            setDcaFunding("");
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
          noun="auto-buy"
        />
      )}
    </main>
  );
}
