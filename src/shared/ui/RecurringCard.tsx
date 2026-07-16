"use client";

import { ActionPill } from "@/shared/ui/ActionPill";
import { statusBadge, formatNextRun, intervalLabel, isOverdue } from "@/entities/strategy/lib/format";
import type { OnchainStrategy } from "@/entities/strategy/model/types";
import type { StrategyAction } from "@/widgets/CreateStrategyModal/ui/StrategyActionModal";

interface Props {
  s: OnchainStrategy;
  /** Who or what this run pays / buys, e.g. "…4f2a", "Payroll", "cirBTC". */
  target: string;
  /** Tailwind text-color class for the target label + progress bar, e.g. "text-blue-primary". */
  accent: string;
  onAction: (action: StrategyAction) => void;
}

/**
 * One recurring payment / auto-buy card. Same visual language as Savings' PlanCard
 * (rounded-card, faint border, status dot-free header row, progress bar, ActionPill row)
 * so Send, Swap and Savings recurring lists read as one system rather than three
 * different list styles bolted together.
 */
export function RecurringCard({ s, target, accent, onAction }: Props) {
  const overdue = isOverdue(s);
  const isActive = s.status === "active";
  const isPaused = s.status === "paused";
  const isDepleted = s.status === "depleted";

  const capped = s.periodsTotal > 0;
  const progress = capped ? Math.min(100, Math.round((s.periodsDone / s.periodsTotal) * 100)) : 0;
  const barCls = accent.replace("text-", "bg-");

  let runLabel: string;
  if (isActive && overdue) runLabel = "due now";
  else if (isActive) runLabel = formatNextRun(s.nextRunAt, s.status);
  else if (isDepleted) runLabel = "needs funds";
  else runLabel = "paused";

  return (
    <div className="rounded-card border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-secondary/35">
          {intervalLabel(s.intervalSeconds)}
        </span>
        <span className={`text-xs font-mono ${overdue || isDepleted ? "text-amber-400" : "text-text-secondary/45"}`}>
          {runLabel}
        </span>
      </div>
      <p className={`text-sm font-semibold mb-1.5 ${accent}`}>
        {s.amountPerPeriod} USDC &rarr; {target}
      </p>
      <p className="text-xs text-text-secondary/40 mb-3 leading-relaxed">
        {s.balance} USDC deposit left
      </p>

      {capped && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-[2px] bg-white/[0.05] rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barCls} transition-all`} style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-mono text-text-secondary/35 tabular-nums shrink-0">
            {s.periodsDone}/{s.periodsTotal}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between -mx-2.5">
        <span className="text-xs text-text-secondary/30 pl-2.5">{statusBadge(s.status).text}</span>
        <div className="flex items-center gap-0.5">
          <ActionPill tone="accent" onClick={() => onAction("fund")}>
            Fund
          </ActionPill>
          {isActive && <ActionPill onClick={() => onAction("pause")}>Pause</ActionPill>}
          {isPaused && <ActionPill onClick={() => onAction("resume")}>Resume</ActionPill>}
          <ActionPill tone="danger" onClick={() => onAction("cancel")}>
            Cancel
          </ActionPill>
        </div>
      </div>
    </div>
  );
}

/** Compact row for a finished (completed/cancelled) recurring item, in the history list. */
export function RecurringPastRow({ target, accent, s }: { target: string; accent: string; s: OnchainStrategy }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] last:border-0 py-3.5 px-1 opacity-45">
      <span className={`text-sm font-semibold truncate ${accent}`}>
        {s.amountPerPeriod} USDC &rarr; {target}
      </span>
      <span className="text-xs text-text-secondary/30 shrink-0">{statusBadge(s.status).text.toLowerCase()}</span>
    </div>
  );
}
