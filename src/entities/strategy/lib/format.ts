import type { OnchainStrategy, StrategyStatus } from "@/entities/strategy/model/types";

/** Interval choices surfaced in the UI. Daily is the finest cadence the free Vercel Cron
 *  tick honours; the contract itself accepts any interval (see docs). */
export const INTERVAL_PRESETS: { label: string; seconds: number }[] = [
  { label: "Daily", seconds: 86_400 },
  { label: "Weekly", seconds: 604_800 },
  { label: "Monthly", seconds: 2_592_000 },
];

export function intervalLabel(seconds: number): string {
  const preset = INTERVAL_PRESETS.find((p) => p.seconds === seconds);
  if (preset) return preset.label.toLowerCase();
  if (seconds % 86_400 === 0) return `every ${seconds / 86_400} days`;
  if (seconds % 3_600 === 0) return `every ${seconds / 3_600} hours`;
  if (seconds % 60 === 0) return `every ${seconds / 60} min`;
  return `every ${seconds}s`;
}

/** Human "next run" relative to now. Past-due (and active) reads as "due now". */
export function formatNextRun(unix: number, status: StrategyStatus): string {
  if (status !== "active") return "—";
  const diffMs = unix * 1000 - Date.now();
  if (diffMs <= 0) return "due now";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}

/** Badge text + Tailwind classes per status, matching the invoice list badge style. */
export function statusBadge(status: StrategyStatus): { text: string; cls: string } {
  switch (status) {
    case "active":
      return { text: "Active", cls: "bg-green-400/10 text-green-400" };
    case "paused":
      return { text: "Paused", cls: "bg-amber-400/10 text-amber-400" };
    case "depleted":
      return { text: "Needs funds", cls: "bg-amber-400/10 text-amber-400" };
    case "completed":
      return { text: "Completed", cls: "bg-blue-primary/10 text-blue-primary" };
    case "cancelled":
      return { text: "Cancelled", cls: "bg-text-secondary/10 text-text-secondary/60" };
  }
}

/**
 * Heuristic: an active strategy that should have run by now but hasn't. Without execution
 * logs (no DB), this is how a silent stall surfaces — e.g. the scheduler isn't running, the
 * executor is out of gas, or a DCA pair has no swap route. Flags only when overdue by more
 * than a full interval (or 2h, whichever is larger) to avoid false positives right after
 * creation or between normal daily ticks.
 */
export function isOverdue(s: OnchainStrategy): boolean {
  if (s.status !== "active") return false;
  const now = Math.floor(Date.now() / 1000);
  return now - s.nextRunAt > Math.max(s.intervalSeconds, 7_200);
}

/** One-line summary of what a strategy does, for list rows and agent replies. */
export function strategySummary(s: OnchainStrategy, tokenOutSymbol?: string): string {
  if (s.kind === "payment") {
    return `Pay ${s.amountPerPeriod} USDC ${intervalLabel(s.intervalSeconds)}`;
  }
  return `Buy ${tokenOutSymbol ?? "token"} with ${s.amountPerPeriod} USDC ${intervalLabel(s.intervalSeconds)}`;
}
