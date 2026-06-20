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
import { statusBadge, formatNextRun, strategySummary } from "@/entities/strategy/lib/format";
import { tokenByAddress } from "@/shared/lib/tokens";
import type { OnchainStrategy } from "@/entities/strategy/model/types";
import type { Session } from "@/entities/user/model/types";

const actionBtn = "shrink-0 text-xs text-blue-primary/70 hover:text-blue-primary transition-colors";

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

  return (
    <main className="min-h-screen bg-navy flex flex-col">
      <BrandHeader />
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto w-full">
        <Link
          href="/dashboard"
          className="block text-sm text-blue-primary/60 hover:text-blue-primary transition-colors mb-6"
        >
          Back
        </Link>

        <div className="flex items-center justify-between gap-4 mb-2">
          <h1 className="text-2xl font-bold text-text-primary">Strategies</h1>
          <button
            onClick={() => setCreateOpen(true)}
            className="shrink-0 bg-blue-primary hover:bg-blue-secondary text-white text-sm font-semibold px-4 py-2 rounded-input transition-colors shadow-glow"
          >
            New strategy
          </button>
        </div>
        <p className="text-text-secondary/60 text-sm mb-6">
          Automated recurring payments and DCA auto-buys. They run onchain on schedule, no PIN each time.
        </p>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass-card rounded-card p-4 flex items-center gap-3">
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-border rounded animate-pulse" />
                  <div className="h-3 w-56 bg-border rounded animate-pulse" />
                </div>
                <div className="h-6 w-16 bg-border rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : strategies.length === 0 ? (
          <p className="text-text-secondary/60 text-sm text-center py-8">
            No strategies yet. Create one to automate payments or auto-buy.
          </p>
        ) : (
          <div className="space-y-3">
            {strategies.map((s) => {
              const badge = statusBadge(s.status);
              const symbol = s.kind === "swap" ? tokenByAddress(s.tokenOut)?.symbol : undefined;
              const canPause = s.status === "active";
              const canResume = s.status === "paused";
              const canFund = s.status === "active" || s.status === "paused" || s.status === "depleted";
              const canCancel = s.status === "active" || s.status === "paused" || s.status === "depleted";
              return (
                <div key={s.id} className="glass-card rounded-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary font-semibold truncate">{strategySummary(s, symbol)}</p>
                      <p className="text-xs text-text-secondary/50 mt-0.5">
                        {s.balance} USDC left
                        {s.periodsTotal > 0 ? ` · ${s.periodsDone}/${s.periodsTotal} runs` : ` · ${s.periodsDone} runs`}
                        {s.status === "active" ? ` · next ${formatNextRun(s.nextRunAt, s.status)}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </div>
                  {(canPause || canResume || canFund || canCancel) && (
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/40">
                      {canFund && (
                        <button className={actionBtn} onClick={() => setPending({ strategy: s, action: "fund" })}>Add funds</button>
                      )}
                      {canPause && (
                        <button className={actionBtn} onClick={() => setPending({ strategy: s, action: "pause" })}>Pause</button>
                      )}
                      {canResume && (
                        <button className={actionBtn} onClick={() => setPending({ strategy: s, action: "resume" })}>Resume</button>
                      )}
                      {canCancel && (
                        <button
                          className="shrink-0 text-xs text-red-400/70 hover:text-red-400 transition-colors ml-auto"
                          onClick={() => setPending({ strategy: s, action: "cancel" })}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
