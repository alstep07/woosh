"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/widgets/AppHeader/ui/AppHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { Button } from "@/shared/ui/Button";
import { Spinner } from "@/shared/ui/Spinner";
import { EmailStep } from "@/features/auth/ui/EmailStep";
import { useChallengeFlow } from "@/features/auth/model/useChallengeFlow";
import { useTokenBalances } from "@/entities/wallet/hooks/useTokenBalances";
import { getSession as loadSession, getCachedTokens } from "@/shared/lib/session";
import { SWAP_TARGETS } from "@/shared/lib/tokens";
import type { Session } from "@/entities/user/model/types";

const AMOUNT_RE = /^\d+(\.\d{1,8})?$/;
// USDC is the native gas token on Arc, so a 100% USDC swap keeps a little back for gas.
const GAS_RESERVE = 0.1;

const PERCENTS = [25, 50, 100] as const;

function tokenGlyph(sym: string): string {
  return sym === "cirBTC" ? "₿" : sym === "EURC" ? "€" : "$";
}

export default function SwapPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  const swapTargets = SWAP_TARGETS.filter((t) => t.address);
  const [token, setToken] = useState<string>(swapTargets[0]?.symbol ?? "EURC");
  const [direction, setDirection] = useState<"buy" | "sell">("buy"); // buy = USDC->token, sell = token->USDC
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<{ loading: boolean; out?: string; error?: string }>({ loading: false });
  const [formError, setFormError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [result, setResult] = useState<{ amountOut: string; tokenOut: string } | null>(null);

  const tokenIn = direction === "buy" ? "USDC" : token;
  const tokenOut = direction === "buy" ? token : "USDC";

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/signup"); return; }
    setSession(s);
  }, [router]);

  const { data: holdings } = useTokenBalances(session?.walletAddress);
  const balanceNum = useMemo(() => {
    const h = holdings?.tokens.find((t) => t.symbol === tokenIn);
    return h ? parseFloat(h.amount) : 0;
  }, [holdings, tokenIn]);
  // Only USDC needs a gas reserve (it IS gas on Arc); token balances are fully spendable.
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
    try {
      const res = await fetch("/api/wallet/swap/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken: tokens.userToken, tokenIn, tokenOut, amount: amount.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; amountOut?: string; tokenOut?: string; error?: string };
      if (!res.ok || !data.ok) { setFormError(data.error ?? "Swap failed. Please try again."); return; }
      setResult({ amountOut: data.amountOut ?? "—", tokenOut: data.tokenOut ?? tokenOut });
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSwapping(false);
    }
  }

  // Live quote, debounced on amount/token/direction changes.
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
    }, 500);
    return () => clearTimeout(t);
  }, [amount, tokenIn, tokenOut]);

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
  }

  const amountNum = parseFloat(amount);
  const validAmount = AMOUNT_RE.test(amount.trim()) && amountNum > 0;
  const exceeds = validAmount && amountNum > spendable + 1e-9;
  const canSubmit = validAmount && !exceeds && !!quote.out && !swapping && flow.phase !== "running";

  function startSwap() {
    if (!validAmount) { setFormError("Enter a valid amount"); return; }
    if (exceeds) { setFormError(`Amount exceeds your ${tokenIn} balance`); return; }
    setFormError(null);
    flow.start();
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-navy flex items-center justify-center">
        <Spinner size="lg" />
      </main>
    );
  }

  const error = formError ?? flow.error;
  const fieldCls =
    "w-full bg-border/40 text-text-primary rounded-input px-3 py-2.5 text-sm border border-border focus:border-blue-primary outline-none transition-colors placeholder:text-text-secondary/40";
  const busy = flow.phase === "running" || swapping;
  const balanceStr = balanceNum > 0 ? `${balanceNum.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${tokenIn}` : `0 ${tokenIn}`;

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <AppHeader />
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-md mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Swap</h1>
          <p className="text-sm text-text-secondary/60 mt-1">
            Convert between USDC and EURC or cirBTC. One PIN, the result lands in your wallet.
          </p>
        </div>

        <div className="glass-card rounded-card p-6">
          {result ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center mx-auto mb-3 text-2xl">✓</div>
              <h2 className="text-lg font-bold text-text-primary mb-1">Swap complete</h2>
              <p className="text-text-secondary text-sm mb-4">
                You received <span className="text-text-primary font-semibold">{result.amountOut} {result.tokenOut}</span>.
              </p>
              <button
                onClick={() => { setResult(null); setAmount(""); setQuote({ loading: false }); }}
                className="text-xs text-blue-primary/70 hover:text-blue-primary transition-colors"
              >
                Make another swap
              </button>
            </div>
          ) : busy ? (
            <div className="text-center py-4">
              <div className="flex justify-center mb-3"><Spinner size="lg" /></div>
              <p className="text-text-secondary text-sm">
                {swapping ? "Swapping…" : "Confirm the transfer in the PIN window…"}
              </p>
            </div>
          ) : flow.phase === "auth" ? (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-text-primary">Confirm it&apos;s you</h2>
              <p className="text-sm text-text-secondary">We need to verify you to fund the swap onchain.</p>
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
                <div className="text-center py-2"><div className="flex justify-center mb-2"><Spinner size="lg" /></div><p className="text-text-secondary text-sm">Sending your code…</p></div>
              )}
              {flow.auth.step === "verify" && (
                <div className="text-center py-2">
                  <div className="flex justify-center mb-2"><Spinner size="lg" /></div>
                  <p className="text-text-secondary text-sm">Enter the code from <span className="text-text-primary">{flow.auth.email}</span> in the window that opened.</p>
                  {flow.auth.error && <p className="text-sm text-red-400 mt-2">{flow.auth.error}</p>}
                </div>
              )}
              <button onClick={flow.backToIdle} className="w-full text-sm text-blue-primary/60 hover:text-blue-primary transition-colors">Back</button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Token to swap against + direction */}
              <div>
                <span className="block text-xs font-medium text-text-secondary mb-1.5">Token</span>
                <div className="grid grid-cols-2 gap-2">
                  {swapTargets.map((t) => {
                    const active = token === t.symbol;
                    return (
                      <button
                        key={t.symbol}
                        onClick={() => { setToken(t.symbol); setAmount(""); setQuote({ loading: false }); setFormError(null); }}
                        className={`flex items-center gap-2 rounded-input border px-3 py-2.5 text-sm transition-colors ${
                          active
                            ? "border-blue-primary bg-blue-primary/10 text-text-primary"
                            : "border-border bg-border/30 text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        <span className={`h-6 w-6 shrink-0 rounded-full grid place-items-center text-xs font-bold ${
                          t.symbol === "cirBTC" ? "bg-amber-400/15 text-amber-400" : "bg-blue-secondary/15 text-blue-secondary"
                        }`}>{tokenGlyph(t.symbol)}</span>
                        <span className="font-semibold">{t.symbol}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Direction: from -> to with a flip button */}
              <div className="flex items-center justify-center gap-3 text-sm">
                <span className="px-3 py-1.5 rounded-input bg-border/40 text-text-primary font-medium">{tokenIn}</span>
                <button
                  onClick={flipDirection}
                  aria-label="Flip direction"
                  className="h-8 w-8 grid place-items-center rounded-full bg-blue-primary/10 text-blue-primary hover:bg-blue-primary/20 transition-colors"
                >
                  ⇄
                </button>
                <span className="px-3 py-1.5 rounded-input bg-border/40 text-text-primary font-medium">{tokenOut}</span>
              </div>

              {/* Amount + balance */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="amount" className="text-xs font-medium text-text-secondary">You pay</label>
                  <span className="text-xs text-text-secondary/50">Balance: {balanceStr}</span>
                </div>
                <div className="relative">
                  <input
                    id="amount"
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setFormError(null); }}
                    placeholder="0.00"
                    autoFocus
                    className={`${fieldCls} pr-20`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">{tokenIn}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {PERCENTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPercent(p)}
                      disabled={spendable <= 0}
                      className="rounded-input border border-border bg-border/30 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-blue-primary/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {p === 100 ? "Max" : `${p}%`}
                    </button>
                  ))}
                </div>
                {tokenIn === "USDC" && (
                  <p className="text-[11px] text-text-secondary/40 mt-1.5">Max keeps ${GAS_RESERVE.toFixed(2)} back for gas.</p>
                )}
              </div>

              {/* Quote */}
              <div className="rounded-input bg-blue-primary/5 border border-blue-primary/15 px-3.5 py-2.5 min-h-[44px] flex items-center justify-between text-sm">
                <span className="text-text-secondary/60">You receive</span>
                {quote.loading ? (
                  <span className="text-text-secondary/50">estimating…</span>
                ) : quote.error ? (
                  <span className="text-amber-400/80 text-xs">{quote.error}</span>
                ) : quote.out ? (
                  <span className="text-text-primary font-semibold">≈ {quote.out} {tokenOut}</span>
                ) : (
                  <span className="text-text-secondary/40">—</span>
                )}
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button onClick={startSwap} disabled={!canSubmit}>Swap</Button>
              <p className="text-xs text-text-secondary/40 text-center">
                Routed via Circle App Kit, with an onchain DEX fallback. You send {tokenIn} once, {tokenOut} comes straight back.
              </p>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </main>
  );
}
