"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BrandHeader from "@/widgets/BrandHeader/ui/BrandHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { Spinner } from "@/shared/ui/Spinner";
import CreateStrategyModal from "@/widgets/CreateStrategyModal/ui/CreateStrategyModal";
import StrategyActionModal, { type StrategyAction } from "@/widgets/CreateStrategyModal/ui/StrategyActionModal";
import { getSession as loadSession } from "@/shared/lib/session";
import { useMyStrategies } from "@/entities/strategy/hooks/useMyStrategies";
import { statusBadge, formatNextRun, intervalLabel, isOverdue } from "@/entities/strategy/lib/format";
import { tokenByAddress } from "@/shared/lib/tokens";
import type { OnchainStrategy } from "@/entities/strategy/model/types";
import type { Session } from "@/entities/user/model/types";

function short(addr?: string | null): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

/** Leading badge glyph + accent colour per strategy kind / target token. */
function kindVisual(s: OnchainStrategy): { glyph: string; accent: string } {
  if (s.kind === "payment") return { glyph: "↻", accent: "text-blue-primary bg-blue-primary/10" };
  const sym = tokenByAddress(s.tokenOut)?.symbol;
  if (sym === "cirBTC") return { glyph: "₿", accent: "text-amber-400 bg-amber-400/10" };
  return { glyph: "€", accent: "text-blue-secondary bg-blue-secondary/10" };
}

function titleFor(s: OnchainStrategy, symbol?: string): { title: string; subtitle: string } {
  const cadence = intervalLabel(s.intervalSeconds);
  if (s.kind === "payment") {
    return { title: `Pay ${s.amountPerPeriod} USDC ${cadence}`, subtitle: `to ${short(s.recipient)}` };
  }
  return { title: `Buy ${symbol ?? "token"} ${cadence}`, subtitle: `${s.amountPerPeriod} USDC per run` };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/50">{label}</p>
      <p className="text-sm text-text-primary truncate mt-0.5">{value}</p>
    </div>
  );
}

function StrategyCard({
  s,
  onAction,
}: {
  s: OnchainStrategy;
  onAction: (action: StrategyAction) => void;
}) {
  const badge = statusBadge(s.status);
  const symbol = s.kind === "swap" ? tokenByAddress(s.tokenOut)?.symbol : undefined;
  const { glyph, accent } = kindVisual(s);
  const { title, subtitle } = titleFor(s, symbol);

  const capped = s.periodsTotal > 0;
  const progress = capped ? Math.min(100, Math.round((s.periodsDone / s.periodsTotal) * 100)) : 0;

  const canPause = s.status === "active";
  const canResume = s.status === "paused";
  const canFund = s.status === "active" || s.status === "paused" || s.status === "depleted";
  const canCancel = canFund;
  const hasActions = canPause || canResume || canFund || canCancel;

  return (
    <div className="glass-card rounded-card p-4 sm:p-5">
      <div className="flex items-start gap-3.5">
        <div className={`shrink-0 h-10 w-10 rounded-full grid place-items-center text-lg font-bold ${accent}`}>
          {glyph}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-text-primary font-semibold truncate">{title}</p>
              <p className="text-xs text-text-secondary/60 mt-0.5 truncate font-mono">{subtitle}</p>
            </div>
            <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${badge.cls}`}>
              {badge.text}
            </span>
          </div>

          {capped && (
            <div className="mt-3">
              <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full bg-blue-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 mt-3">
            <Stat label="Left" value={`${s.balance} USDC`} />
            <Stat label="Runs" value={capped ? `${s.periodsDone} / ${s.periodsTotal}` : `${s.periodsDone}`} />
            <Stat
              label={s.status === "active" ? "Next run" : "Status"}
              value={s.status === "active" ? formatNextRun(s.nextRunAt, s.status) : badge.text}
            />
          </div>

          {isOverdue(s) && (
            <p className="mt-3 text-xs text-amber-400/80 flex items-start gap-1.5">
              <span aria-hidden className="shrink-0">⚠</span>
              <span>
                Overdue. It hasn&apos;t run on schedule
                {s.kind === "swap" ? " — the scheduler may be down or no swap route is available right now." : " — the scheduler may be down or the executor is low on gas."}
              </span>
            </p>
          )}
        </div>
      </div>

      {hasActions && (
        <div className="flex items-center gap-1 mt-4 pt-3 border-t border-border/50 text-xs">
          {canFund && (
            <button className="px-2.5 py-1 rounded-input text-blue-primary/80 hover:text-blue-primary hover:bg-blue-primary/10 transition-colors" onClick={() => onAction("fund")}>
              Add funds
            </button>
          )}
          {canPause && (
            <button className="px-2.5 py-1 rounded-input text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors" onClick={() => onAction("pause")}>
              Pause
            </button>
          )}
          {canResume && (
            <button className="px-2.5 py-1 rounded-input text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors" onClick={() => onAction("resume")}>
              Resume
            </button>
          )}
          {canCancel && (
            <button className="ml-auto px-2.5 py-1 rounded-input text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors" onClick={() => onAction("cancel")}>
              Cancel
            </button>
          )}
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
        <Spinner size="lg" />
      </main>
    );
  }

  const active = strategies.filter((s) => s.status === "active" || s.status === "paused" || s.status === "depleted");
  const closed = strategies.filter((s) => s.status === "completed" || s.status === "cancelled");

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <BrandHeader />
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto w-full">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-blue-primary/60 hover:text-blue-primary transition-colors mb-6"
        >
          Dashboard
        </Link>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Strategies</h1>
            <p className="text-text-secondary/60 text-sm mt-1 max-w-md">
              Recurring payments and DCA auto-buys. They run onchain on schedule, no PIN each time.
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="shrink-0 bg-blue-primary hover:bg-blue-secondary text-white text-sm font-semibold px-4 py-2 rounded-input transition-colors shadow-glow"
          >
            New strategy
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="glass-card rounded-card p-5 flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-full bg-border animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-44 bg-border rounded animate-pulse" />
                  <div className="h-3 w-28 bg-border rounded animate-pulse" />
                  <div className="h-8 w-full bg-border/60 rounded animate-pulse mt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : strategies.length === 0 ? (
          <div className="glass-card rounded-card py-12 px-6 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-blue-primary/10 text-blue-primary grid place-items-center text-2xl">↻</div>
            <p className="text-text-primary font-semibold">No strategies yet</p>
            <p className="text-text-secondary/60 text-sm mt-1 mb-5 max-w-xs mx-auto">
              Automate a recurring payment, or dollar-cost average into EURC or cirBTC.
            </p>
            <button
              onClick={() => setCreateOpen(true)}
              className="bg-blue-primary hover:bg-blue-secondary text-white text-sm font-semibold px-4 py-2 rounded-input transition-colors shadow-glow"
            >
              Create your first strategy
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {active.length > 0 && (
              <div className="space-y-3">
                {active.map((s) => (
                  <StrategyCard key={s.id} s={s} onAction={(action) => setPending({ strategy: s, action })} />
                ))}
              </div>
            )}
            {closed.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary/40 mb-2 px-1">
                  Past
                </p>
                <div className="space-y-3">
                  {closed.map((s) => (
                    <StrategyCard key={s.id} s={s} onAction={(action) => setPending({ strategy: s, action })} />
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
