"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/widgets/AppHeader/ui/AppHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { Button } from "@/shared/ui/Button";
import { PageHeader } from "@/shared/ui/PageHeader";
import { EmptyState } from "@/shared/ui/EmptyState";
import { RefreshButton } from "@/shared/ui/RefreshButton";
import { ActionPill } from "@/shared/ui/ActionPill";
import CreateSavingsModal from "@/widgets/CreateSavingsModal/ui/CreateSavingsModal";
import StrategyActionModal, { type StrategyAction } from "@/widgets/CreateStrategyModal/ui/StrategyActionModal";
import SavingsActionModal, { type SavingsActionMode } from "@/widgets/SavingsActionModal/ui/SavingsActionModal";
import { getSession as loadSession } from "@/shared/lib/session";
import { useMyStrategies } from "@/entities/strategy/hooks/useMyStrategies";
import { useVaultBalances } from "@/entities/savings/hooks/useVaultBalances";
import { statusBadge, formatNextRun, intervalLabel, isOverdue, allocationLabel } from "@/entities/strategy/lib/format";
import { tokenByAddress } from "@/shared/lib/tokens";
import { fmtAmount as fmtVaultAmount } from "@/shared/lib/format";
import { TokenIcon } from "@/shared/ui/TokenIcon";
import { env } from "@/shared/config/env";
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
    <div className="glass-card rounded-card p-6 sm:p-7 mb-6">
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-2">Saved</p>

      {isLoading ? (
        <div className="h-11 w-40 bg-border rounded animate-pulse mb-5" />
      ) : isError ? (
        <p className="text-4xl font-bold text-text-secondary/40 mb-5">—</p>
      ) : !hasAnything ? (
        <div className="mb-6">
          <p className="font-mono text-4xl sm:text-5xl font-semibold text-text-primary/30 tracking-tight">0.00</p>
          <p className="text-text-secondary/45 text-sm mt-2 leading-relaxed max-w-sm">
            Deposit USDC into the vault to keep it separate from your spendable balance.
          </p>
        </div>
      ) : (
        <div className="mb-6">
          <p className="font-mono text-4xl sm:text-5xl font-semibold text-text-primary tracking-tight leading-none">
            {fmtVaultAmount(vault!.usdc)}
            <span className="font-sans text-base font-medium text-text-secondary/45 ml-2">USDC</span>
          </p>
          {rows.length > 0 && (
            <div className="mt-5 space-y-3">
              {rows.map((r) => (
                <div key={r.symbol} className="flex items-center gap-3">
                  <TokenIcon symbol={r.symbol} size={28} />
                  <span className="text-sm text-text-secondary flex-1">{r.symbol}</span>
                  <span className="font-mono text-sm text-text-primary tabular-nums">{fmtVaultAmount(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button className="flex-1" onClick={onDeposit}>
          Deposit
        </Button>
        <Button variant="secondary" className="flex-1 min-h-[48px] py-3.5" onClick={onWithdraw} disabled={!hasAnything}>
          Withdraw
        </Button>
      </div>

      {vault?.sweepRule.enabled && (
        <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-start gap-2.5">
          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" aria-hidden />
          <p className="text-xs text-text-secondary/45 leading-relaxed">
            Auto-save active. Sweeps balance above {fmtVaultAmount(vault.sweepRule.threshold)} USDC, up to{" "}
            {fmtVaultAmount(vault.sweepRule.capPerRun)} USDC per run.
          </p>
        </div>
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
  const target = allocationLabel(s, legSymbol) || "Loading allocation…";

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
    <div className="rounded-card border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-widest text-text-secondary/35">Plan</span>
        <span className={`text-xs font-mono ${
          overdue || isDepleted ? "text-amber-400" : "text-text-secondary/45"
        }`}>{runLabel}</span>
      </div>
      <p className="text-sm font-semibold text-violet-400 mb-1.5">{target}</p>
      <p className="text-xs text-text-secondary/40 mb-3 leading-relaxed">
        {isSweep
          ? `Sweeps up to ${s.amountPerPeriod} USDC above ${s.portfolio?.sweepThreshold ?? "0"} USDC in your wallet, ${intervalLabel(s.intervalSeconds)}`
          : `Allocates ${s.amountPerPeriod} USDC ${intervalLabel(s.intervalSeconds)}, ${s.balance} USDC deposit left`}
      </p>

      {capped && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-[2px] bg-white/[0.05] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-mono text-text-secondary/35 tabular-nums shrink-0">
            {s.periodsDone}/{s.periodsTotal}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between -mx-2.5">
        <span className="text-xs text-text-secondary/30 pl-2.5">{statusBadge(s.status).text}</span>
        <div className="flex items-center gap-0.5">
          {canFund && (
            <ActionPill tone="accent" onClick={() => onAction("fund")}>
              Add funds
            </ActionPill>
          )}
          {isActive && (
            <ActionPill onClick={() => onAction("pause")}>Pause</ActionPill>
          )}
          {isPaused && (
            <ActionPill onClick={() => onAction("resume")}>Resume</ActionPill>
          )}
          <ActionPill tone="danger" onClick={() => onAction("cancel")}>
            Cancel
          </ActionPill>
        </div>
      </div>
    </div>
  );
}

/** Compact row for a finished (completed/cancelled) plan, in the history list. */
function PastRow({ s }: { s: OnchainStrategy }) {
  const target = allocationLabel(s, legSymbol) || "Loading allocation…";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] last:border-0 py-3.5 px-1 opacity-45">
      <span className="text-sm font-semibold text-violet-400 truncate">{target}</span>
      <span className="text-xs text-text-secondary/30 shrink-0">{statusBadge(s.status).text.toLowerCase()}</span>
    </div>
  );
}

export default function SavingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState<{ strategy: OnchainStrategy; action: StrategyAction } | null>(null);
  const [savingsAction, setSavingsAction] = useState<SavingsActionMode | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { strategies: allStrategies, loading, isError: strategiesError, refetch } = useMyStrategies(session?.walletAddress);
  const strategies = allStrategies.filter((s) => s.kind === "portfolio");
  const vault = useVaultBalances(session?.walletAddress as `0x${string}` | undefined);

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/signup"); return; }
    setSession(s);
  }, [router]);

  // One refresh button drives both the vault balance and the plan list: they're two
  // reads of the same underlying savings state, so a user hitting "refresh" expects
  // both to update together rather than picking which one they meant.
  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([refetch(), vault.refetch()]);
    setIsRefreshing(false);
  }

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
      {/* Content width: Savings is a plain list page (vault card + at most one plan +
          history), so it stays at the narrower max-w-2xl throughout, same as Invoices.
          Payments and Swap are list-and-tool pages (a create form plus a recurring
          list) and widen to a two-column layout at lg+, see PayEntryPage.tsx. */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto w-full">

        <PageHeader
          title="Savings"
          subtitle="One vault, a target mix of USDC, EURC and cirBTC, topped up on autopilot"
          className="mb-6"
          action={<RefreshButton onRefresh={handleRefresh} isRefreshing={isRefreshing} />}
        />

        {/* Vault: what's actually saved, held in WooshSavingsVault, separate from
            the spendable wallet balance */}
        <VaultCard
          vault={vault.data}
          isLoading={vault.isLoading}
          // A misconfigured vault address disables the query entirely; render that as
          // the error dash, never as "Nothing saved yet" (the user may well have funds).
          isError={vault.isError || !env.savingsVaultAddress}
          onDeposit={() => setSavingsAction("deposit")}
          onWithdraw={() => setSavingsAction("withdraw")}
        />

        {/* Plan */}
        {loading ? (
          <div className="glass-card rounded-card p-4 mb-6">
            <div className="h-4 w-40 bg-border rounded animate-pulse mb-3" />
            <div className="h-3 w-full bg-border/60 rounded animate-pulse" />
          </div>
        ) : strategiesError ? (
          <EmptyState
            glyph="!"
            primary="Couldn't load your savings plan."
            secondary="There was a problem reading from the network. Try again in a moment."
            className="glass-card rounded-card p-6 text-center mb-6"
          />
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
            <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary/30 mb-3 px-1">
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
