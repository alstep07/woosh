"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/widgets/AppHeader/ui/AppHeader";
import Footer from "@/widgets/Footer/ui/Footer";
import { Button } from "@/shared/ui/Button";
import { PageHeader } from "@/shared/ui/PageHeader";
import { RefreshButton } from "@/shared/ui/RefreshButton";
import SavingsActionModal, { type SavingsActionMode } from "@/widgets/SavingsActionModal/ui/SavingsActionModal";
import { getSession as loadSession } from "@/shared/lib/session";
import { useVaultBalances } from "@/entities/savings/hooks/useVaultBalances";
import { fmtAmount as fmtVaultAmount } from "@/shared/lib/format";
import { TokenIcon } from "@/shared/ui/TokenIcon";
import { env } from "@/shared/config/env";
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
      ) : /* A background poll can fail (429, transient timeout) after we already have a
             good cached vault. isError must not hide a real balance we're still
             holding, only show "—" when there's truly nothing cached yet. */
      !vault && isError ? (
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

/**
 * Savings: a WooshSavingsVault balance (USDC/EURC/cirBTC), separate from the spendable
 * wallet balance. Deposit and withdraw anytime, no schedule, no lockup, no allocation to
 * configure. Kind.Portfolio (the old target-percent-mix automation) is a different
 * contract mechanism entirely and is not surfaced here at all.
 */
export default function SavingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [savingsAction, setSavingsAction] = useState<SavingsActionMode | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const vault = useVaultBalances(session?.walletAddress as `0x${string}` | undefined);

  useEffect(() => {
    const s = loadSession();
    if (!s) { router.replace("/signup"); return; }
    setSession(s);
  }, [router]);

  async function handleRefresh() {
    setIsRefreshing(true);
    await vault.refetch();
    setIsRefreshing(false);
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-navy flex items-center justify-center">
        <span className="shimmer-text text-sm font-medium">Loading…</span>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <AppHeader />
      {/* Content width: Savings is a plain list page (just the vault card), so it stays
          at the narrower max-w-2xl throughout, same as Invoices. Payments and Swap are
          list-and-tool pages (a create form plus a recurring list) and widen to a
          two-column layout at lg+, see PayEntryPage.tsx. */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto w-full">

        <PageHeader
          title="Savings"
          subtitle="A vault for USDC, EURC and cirBTC, separate from your spendable balance. Deposit and withdraw anytime."
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
      </div>
      <Footer />

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
