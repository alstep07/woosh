"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/widgets/AppHeader/ui/AppHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { Button } from "@/shared/ui/Button";
import { PageHeader } from "@/shared/ui/PageHeader";
import { EmptyState } from "@/shared/ui/EmptyState";
import CreateSavingsModal from "@/widgets/CreateSavingsModal/ui/CreateSavingsModal";
import StrategyActionModal, { type StrategyAction } from "@/widgets/CreateStrategyModal/ui/StrategyActionModal";
import SavingsActionModal, { type SavingsActionMode } from "@/widgets/SavingsActionModal/ui/SavingsActionModal";
import { getSession as loadSession } from "@/shared/lib/session";
import { useMyStrategies } from "@/entities/strategy/hooks/useMyStrategies";
import { useVaultBalances } from "@/entities/savings/hooks/useVaultBalances";
import { statusBadge, formatNextRun, intervalLabel, isOverdue, allocationLabel } from "@/entities/strategy/lib/format";
import { tokenByAddress } from "@/shared/lib/tokens";
import { fmtAmount as fmtVaultAmount, tokenGlyph as vaultGlyph } from "@/shared/lib/format";
import type { OnchainStrategy } from "@/entities/strategy/model/types";
import type { VaultHoldings } from "@/entities/savings/model/types";
import type { Session } from "@/entities/user/model/types";

const EMPTY_VAULT: VaultHoldings = {
  usdc: "0",
  eurc: "0",
  cirbtc: "0",
  sweepRule: { threshold: "0", capPerRun: "0", intervalSeconds: 0, nextRunAt: 0, enabled: false },
};

/** What's actually saved, straight from the vault contract, separate from the
 *  spendable wallet balance. USDC is the headline figure; EURC/cirBTC show below when
 *  held. Deposit/Withdraw open SavingsActionModal. */
function VaultCard({
  vault,
  isLoading,
  isError,
  onDeposit,
  onWithdraw,
}: {
  vault: VaultHoldings | undefined;
  isLoading: boolean;
  isError: boolean;
  onDeposit: () => void;
  onWithdraw: () => void;
}) {
  const rows = [
    { symbol: "EURC", amount: vault?.eurc ?? "0" },
    { symbol: "cirBTC", amount: vault?.cirbtc ?? "0" },
  ].filter((r) => parseFloat(r.amount) > 0);

  const hasAnything =
    !!vault && (parseFloat(vault.usdc) > 0 || parseFloat(vault.eurc) > 0 || parseFloat(vault.cirbtc) > 0);

  return (
    <div className="glass-card rounded-card p-5 mb-6">
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1">Vault</p>

      {isLoading ? (
        <div className="h-9 w-32 bg-border rounded animate-pulse mb-3" />
      ) : isError ? (
        <p className="text-3xl font-bold text-text-secondary/40 mb-3">—</p>
      ) : !hasAnything ? (
        <div className="mb-4">
          <p className="text-text-secondary/60 text-sm">Nothing saved yet.</p>
          <p className="text-text-secondary/35 text-xs mt-1">
            Deposit USDC into the vault to keep it separate from your spendable balance.
          </p>
        </div>
      ) : (
        <div className="mb-3">
          <p className="font-mono text-3xl font-semibold text-text-primary tracking-tight">
            {fmtVaultAmount(vault!.usdc)}
            <span className="font-sans text-base font-medium text-text-secondary/50 ml-1.5">USDC</span>
          </p>
          {rows.length > 0 && (
            <div className="mt-3 space-y-2">
              {rows.map((r) => {
                const g = vaultGlyph(r.symbol);
                return (
                  <div key={r.symbol} className="flex items-center gap-2.5">
                    <span className={`shrink-0 h-6 w-6 rounded-full grid place-items-center text-xs font-bold ${g.cls}`}>
                      {g.ch}
                    </span>
                    <span className="text-sm text-text-secondary flex-1">{r.symbol}</span>
                    <span className="font-mono text-sm text-text-primary tabular-nums">{fmtVaultAmount(r.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <Button size="sm" className="flex-1" onClick={onDeposit}>
          Deposit
        </Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={onWithdraw} disabled={!hasAnything}>
          Withdraw
        </Button>
      </div>

      {vault?.sweepRule.enabled && (
        <p className="text-[11px] text-text-secondary/40 mt-3">
          Auto-save: sweeps excess over {fmtVaultAmount(vault.sweepRule.threshold)} USDC in your wallet, up to{" "}
          {fmtVaultAmount(vault.sweepRule.capPerRun)} USDC per run.
        </p>
      )}
    </div>
  );
}

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
  const [savingsAction, setSavingsAction] = useState<SavingsActionMode | null>(null);

  const { strategies: allStrategies, loading, refetch } = useMyStrategies(session?.walletAddress);
  const strategies = allStrategies.filter((s) => s.kind === "portfolio");
  const vault = useVaultBalances(session?.walletAddress as `0x${string}` | undefined);

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

        <PageHeader
          title="Savings"
          subtitle="One vault, a target mix of USDC, EURC and cirBTC, topped up on autopilot"
          className="mb-6"
        />

        {/* Vault: what's actually saved, held in WooshSavingsVault, separate from
            the spendable wallet balance */}
        <VaultCard
          vault={vault.data}
          isLoading={vault.isLoading}
          isError={vault.isError}
          onDeposit={() => setSavingsAction("deposit")}
          onWithdraw={() => setSavingsAction("withdraw")}
        />

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
          <EmptyState
            glyph="◔"
            primary="No savings plan yet."
            secondary="Set a target mix, e.g. 50% USDC / 30% cirBTC / 20% EURC, funded by a deposit or by sweeping your wallet balance above a threshold."
            cta={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                Set up savings
              </Button>
            }
            className="glass-card rounded-card p-6 text-center mb-6"
          />
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
      {savingsAction && (
        <SavingsActionModal
          session={session}
          mode={savingsAction}
          vault={vault.data ?? EMPTY_VAULT}
          onClose={() => setSavingsAction(null)}
          onDone={() => vault.refetch()}
        />
      )}
    </main>
  );
}
