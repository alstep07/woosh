"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/widgets/AppHeader/ui/AppHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import CreateStrategyModal from "@/widgets/CreateStrategyModal/ui/CreateStrategyModal";
import StrategyActionModal, { type StrategyAction } from "@/widgets/CreateStrategyModal/ui/StrategyActionModal";
import { getSession as loadSession } from "@/shared/lib/session";
import { useMyStrategies } from "@/entities/strategy/hooks/useMyStrategies";
import { statusBadge, formatNextRun, intervalLabel, isOverdue } from "@/entities/strategy/lib/format";
import { tokenByAddress } from "@/shared/lib/tokens";
import type { OnchainStrategy, StrategyStatus } from "@/entities/strategy/model/types";
import type { Session } from "@/entities/user/model/types";

function short(addr?: string | null): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";
}

function accentColor(s: OnchainStrategy, symbol?: string): string {
  if (s.kind === "payment") return "bg-blue-primary";
  if (symbol === "cirBTC") return "bg-amber-400";
  return "bg-cyan-400";
}

const STATUS_DOT_CLS: Record<StrategyStatus, string> = {
  active:    "bg-green-400",
  paused:    "bg-amber-400/60",
  depleted:  "bg-amber-400",
  completed: "bg-blue-primary/40",
  cancelled: "bg-white/15",
};

function StrategyRow({
  s,
  onAction,
}: {
  s: OnchainStrategy;
  onAction: (action: StrategyAction) => void;
}) {
  const symbol = s.kind === "swap" ? tokenByAddress(s.tokenOut)?.symbol : undefined;
  const accent = accentColor(s, symbol);
  const overdue = isOverdue(s);

  const isActive    = s.status === "active";
  const isPaused    = s.status === "paused";
  const isDepleted  = s.status === "depleted";
  const isRunning   = isActive || isPaused || isDepleted;
  const isFinished  = s.status === "completed" || s.status === "cancelled";

  const capped   = s.periodsTotal > 0;
  const progress = capped ? Math.min(100, Math.round((s.periodsDone / s.periodsTotal) * 100)) : 0;

  const target  = s.kind === "payment" ? short(s.recipient) : (symbol ?? "token");
  const canFund = isActive || isPaused || isDepleted;

  let runLabel: string | null = null;
  if (isActive && overdue) runLabel = "due now";
  else if (isActive)       runLabel = formatNextRun(s.nextRunAt, s.status);
  else if (isDepleted)     runLabel = "needs funds";
  else if (isPaused)       runLabel = "paused";

  return (
    <div className={`relative border-b border-white/[0.05] last:border-0 py-4 px-1 ${isFinished ? "opacity-45" : ""}`}>
      <div className="flex items-center gap-3">
        {/* Live pulse */}
        <div className="relative shrink-0 w-3 h-3 flex items-center justify-center">
          <span className={`block w-2 h-2 rounded-full ${STATUS_DOT_CLS[s.status]}`} />
          {isActive && !overdue && (
            <span className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-green-400 animate-ping opacity-50" />
          )}
        </div>

        {/* Core description */}
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5 flex-wrap">
          <span className="font-mono text-sm font-medium text-text-primary tabular-nums">{s.amountPerPeriod} USDC</span>
          <span className="text-text-secondary/40 text-xs">→</span>
          <span className={`text-sm font-semibold ${
            s.kind === "payment" ? "text-text-secondary/80"
            : symbol === "cirBTC" ? "text-amber-400"
            : "text-cyan-400"
          }`}>{target}</span>
          <span className="text-text-secondary/30 text-[11px]">· {intervalLabel(s.intervalSeconds)}</span>
        </div>

        {/* Status / next run — right-aligned */}
        <div className="shrink-0 min-w-[80px] text-right">
          {runLabel ? (
            <span className={`text-xs font-mono ${
              overdue || isDepleted ? "text-amber-400"
              : isActive ? "text-text-secondary/60"
              : "text-text-secondary/35"
            }`}>{runLabel}</span>
          ) : (
            <span className="text-[11px] text-text-secondary/25">{statusBadge(s.status).text.toLowerCase()}</span>
          )}
        </div>
      </div>

      {/* Progress bar for capped strategies */}
      {capped && isRunning && (
        <div className="ml-6 mt-2 flex items-center gap-2">
          <div className="flex-1 h-[2px] bg-white/[0.05] rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${accent} transition-all`} style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[10px] font-mono text-text-secondary/35 tabular-nums shrink-0">
            {s.periodsDone}/{s.periodsTotal}
          </span>
        </div>
      )}

      {/* Bottom row: balance + actions */}
      {isRunning && (
        <div className="ml-6 mt-2 flex items-center justify-between">
          <span className="text-[11px] font-mono text-text-secondary/35 tabular-nums">
            {s.balance} USDC left
          </span>
          <div className="flex items-center gap-0.5">
            {canFund && (
              <button
                onClick={() => onAction("fund")}
                className="text-[11px] text-blue-primary/60 hover:text-blue-primary px-2 py-0.5 rounded hover:bg-blue-primary/8 transition-colors"
              >
                Fund
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
      )}
    </div>
  );
}

export default function StrategiesPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState<{ strategy: OnchainStrategy; action: StrategyAction } | null>(null);

  const { strategies, loading, refetch } = useMyStrategies(session?.walletAddress);

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

  const active  = strategies.filter((s) => s.status === "active" || s.status === "paused" || s.status === "depleted");
  const closed  = strategies.filter((s) => s.status === "completed" || s.status === "cancelled");
  const running = active.filter((s) => s.status === "active").length;

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <AppHeader />
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Strategies</h1>
            {running > 0 && (
              <p className="text-xs text-text-secondary/50 mt-0.5 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                {running} running
              </p>
            )}
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="shrink-0 bg-blue-primary hover:bg-blue-secondary text-white text-sm font-semibold px-4 py-2 rounded-input transition-colors shadow-glow"
          >
            New
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="border-b border-white/[0.05] pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-border animate-pulse shrink-0" />
                  <div className="h-4 w-48 bg-border rounded animate-pulse" />
                  <div className="ml-auto h-3 w-14 bg-border/60 rounded animate-pulse" />
                </div>
                <div className="ml-6 mt-2 h-[2px] bg-border/40 rounded animate-pulse" />
              </div>
            ))}
          </div>

        ) : strategies.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-3xl mb-4 opacity-20">↻</div>
            <p className="text-text-secondary/60 text-sm">No strategies yet.</p>
            <p className="text-text-secondary/35 text-xs mt-1 mb-6">
              Set up a recurring payment or a DCA auto-buy.
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              className="bg-blue-primary hover:bg-blue-secondary text-white text-sm font-semibold px-4 py-2 rounded-input transition-colors shadow-glow"
            >
              Create strategy
            </button>
          </div>

        ) : (
          <div>
            {active.length > 0 && (
              <div className="glass-card rounded-card px-4 mb-6">
                {active.map((s) => (
                  <StrategyRow key={s.id} s={s} onAction={(action) => setPending({ strategy: s, action })} />
                ))}
              </div>
            )}

            {closed.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-text-secondary/30 mb-3 px-1">
                  Past
                </p>
                <div className="glass-card rounded-card px-4">
                  {closed.map((s) => (
                    <StrategyRow key={s.id} s={s} onAction={(action) => setPending({ strategy: s, action })} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <Footer />

      {createOpen && (
        <CreateStrategyModal session={session} onClose={() => setCreateOpen(false)} onCreated={refetch} />
      )}
      {pending && (
        <StrategyActionModal
          session={session}
          strategy={pending.strategy}
          action={pending.action}
          onClose={() => setPending(null)}
          onDone={refetch}
        />
      )}
    </main>
  );
}
