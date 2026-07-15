"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/widgets/AppHeader/ui/AppHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { BalanceSummary } from "@/widgets/WalletCard/ui/BalanceSummary";
import CreateSavingsModal from "@/widgets/CreateSavingsModal/ui/CreateSavingsModal";
import StrategyActionModal, { type StrategyAction } from "@/widgets/CreateStrategyModal/ui/StrategyActionModal";
import { getSession as loadSession } from "@/shared/lib/session";
import { useMyStrategies } from "@/entities/strategy/hooks/useMyStrategies";
import { useTokenBalances } from "@/entities/wallet/hooks/useTokenBalances";
import { statusBadge, formatNextRun, intervalLabel, isOverdue, allocationLabel } from "@/entities/strategy/lib/format";
import { tokenByAddress } from "@/shared/lib/tokens";
import type { OnchainStrategy } from "@/entities/strategy/model/types";
import type { Session } from "@/entities/user/model/types";

/** Symbol for an allocation leg token (null = the USDC leg). */
function legSymbol(token: `0x${string}` | null): string {
  return token === null ? "USDC" : tokenByAddress(token)?.symbol ?? "?";
}

/** The current savings plan: target allocation, funding method, schedule, and actions.
 *  There is at most one active plan at a time (the contract has no "edit allocation" —
 *  changing the target means cancelling this one and creating a new one). */
function PlanCard({
  s,
  onAction,
}: {
  s: OnchainStrategy;
  onAction: (action: StrategyAction) => void;
}) {
  const overdue = isOverdue(s);
  const isSweep = s.portfolio?.mode === "sweep";
  const target = allocationLabel(s, legSymbol) || "savings";

  const isActive   = s.status === "active";
  const isPaused   = s.status === "paused";
  const isDepleted = s.status === "depleted";

  const capped   = s.periodsTotal > 0;
  const progress = capped ? Math.min(100, Math.round((s.periodsDone / s.periodsTotal) * 100)) : 0;

  // Sweep savings custody nothing: there is no balance to fund or show.
  const canFund = !isSweep;

  let runLabel: string;
  if (isActive && overdue) runLabel = "due now";
  else if (isActive)       runLabel = formatNextRun(s.nextRunAt, s.status);
  else if (isDepleted)     runLabel = "needs funds";
  else                     runLabel = "paused";

  return (
    <div className="glass-card rounded-card p-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-sm font-semibold text-violet-400">{target}</span>
        <span className={`text-[11px] font-mono ${
          overdue || isDepleted ? "text-amber-400" : "text-text-secondary/50"
        }`}>{runLabel}</span>
      </div>
      <p className="text-[11px] text-text-secondary/40 mb-3">
        {isSweep
          ? `Sweeps up to ${s.amountPerPeriod} USDC above ${s.portfolio?.sweepThreshold ?? "0"} USDC in your wallet, ${intervalLabel(s.intervalSeconds)}`
          : `Allocates ${s.amountPerPeriod} USDC ${intervalLabel(s.intervalSeconds)}, ${s.balance} USDC deposit left`}
      </p>

      {capped && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-[2px] bg-white/[0.05] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[10px] font-mono text-text-secondary/35 tabular-nums shrink-0">
            {s.periodsDone}/{s.periodsTotal}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-secondary/25">{statusBadge(s.status).text}</span>
        <div className="flex items-center gap-0.5">
          {canFund && (
            <button
              onClick={() => onAction("fund")}
              className="text-[11px] text-blue-primary/60 hover:text-blue-primary px-2 py-0.5 rounded hover:bg-blue-primary/8 transition-colors"
            >
              Add funds
            </button>
          )}
          {isActive && (
            <button
              onClick={() => onAction("pause")}
              className="text-[11px] text-text-secondary/40 hover:text-text-secondary px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
            >
              Pause
            </button>
          )}
          {isPaused && (
            <button
              onClick={() => onAction("resume")}
              className="text-[11px] text-text-secondary/40 hover:text-text-secondary px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
            >
              Resume
            </button>
          )}
          <button
            onClick={() => onAction("cancel")}
            className="text-[11px] text-red-400/40 hover:text-red-400 px-2 py-0.5 rounded hover:bg-red-400/8 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Compact row for a finished (completed/cancelled) plan, in the history list. */
function PastRow({ s }: { s: OnchainStrategy }) {
  const target = allocationLabel(s, legSymbol) || "savings";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] last:border-0 py-3 px-1 opacity-45">
      <span className="text-sm font-semibold text-violet-400 truncate">{target}</span>
      <span className="text-[11px] text-text-secondary/25 shrink-0">{statusBadge(s.status).text.toLowerCase()}</span>
    </div>
  );
}

export default function SavingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState<{ strategy: OnchainStrategy; action: StrategyAction } | null>(null);

  const { strategies: allStrategies, loading, refetch } = useMyStrategies(session?.walletAddress);
  const strategies = allStrategies.filter((s) => s.kind === "portfolio");
  const holdings = useTokenBalances(session?.walletAddress as `0x${string}` | undefined);

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/signup"); return; }
    setSession(s);
  }, [router]);

  if (!session) {
    return (
      <main className="min-h-screen bg-navy flex items-center justify-center">
        <span className="shimmer-text text-sm font-medium">Loading…</span>
      </main>
    );
  }

  // At most one plan is ever active/paused/depleted at a time (enforced here in the UI;
  // the contract itself would happily run several, but "one target allocation" is the
  // whole point of a single vault). If somehow more than one is running (e.g. created
  // before this page existed), show all of them rather than silently hiding funds.
  const active = strategies.filter((s) => s.status === "active" || s.status === "paused" || s.status === "depleted");
  const closed = strategies.filter((s) => s.status === "completed" || s.status === "cancelled");

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <AppHeader />
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto w-full">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Savings</h1>
          <p className="text-xs text-text-secondary/50 mt-0.5">
            One vault, a target mix of USDC, EURC and cirBTC, topped up on autopilot
          </p>
        </div>

        {/* Vault: what's actually saved, right now, straight from the wallet */}
        <div className="glass-card rounded-card p-5 mb-6">
          <BalanceSummary
            balance={holdings.data?.tokens.find((t) => t.symbol === "USDC")?.amount}
            isLoading={holdings.isLoading}
            isError={holdings.isError}
            holdings={holdings.data?.tokens}
            totalUsd={holdings.data?.totalUsd}
          />
        </div>

        {/* Plan */}
        {loading ? (
          <div className="glass-card rounded-card p-4 mb-6">
            <div className="h-4 w-40 bg-border rounded animate-pulse mb-3" />
            <div className="h-3 w-full bg-border/60 rounded animate-pulse" />
          </div>
        ) : active.length > 0 ? (
          <div className="space-y-3 mb-6">
            {active.map((s) => (
              <PlanCard key={s.id} s={s} onAction={(action) => setPending({ strategy: s, action })} />
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-card p-6 text-center mb-6">
            <div className="text-3xl mb-3 opacity-20">◔</div>
            <p className="text-text-secondary/60 text-sm">No savings plan yet.</p>
            <p className="text-text-secondary/35 text-xs mt-1 mb-5">
              Set a target mix, e.g. 50% USDC / 30% cirBTC / 20% EURC, funded by a
              deposit or by sweeping your wallet balance above a threshold.
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              className="bg-blue-primary hover:bg-blue-secondary text-white text-sm font-semibold px-4 py-2 rounded-input transition-colors shadow-glow"
            >
              Set up savings
            </button>
          </div>
        )}

        {active.length > 0 && (
          <button
            onClick={() => setCreateOpen(true)}
            className="w-full text-center text-xs text-text-secondary/40 hover:text-text-secondary transition-colors mb-6"
          >
            Want a different mix? Cancel the plan above, then set up a new one.
          </button>
        )}

        {closed.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-secondary/30 mb-3 px-1">
              Past
            </p>
            <div className="glass-card rounded-card px-4">
              {closed.map((s) => (
                <PastRow key={s.id} s={s} />
              ))}
            </div>
          </div>
        )}
      </div>
      <Footer />

      {createOpen && (
        <CreateSavingsModal session={session} onClose={() => setCreateOpen(false)} onCreated={refetch} />
      )}
      {pending && (
        <StrategyActionModal
          session={session}
          strategy={pending.strategy}
          action={pending.action}
          onClose={() => setPending(null)}
          onDone={refetch}
          noun="savings"
        />
      )}
    </main>
  );
}
