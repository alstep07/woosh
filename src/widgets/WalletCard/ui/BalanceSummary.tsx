"use client";

import type { TokenHolding } from "@/entities/wallet/hooks/useTokenBalances";
import { fmtAmount, tokenGlyph } from "@/shared/lib/format";

function fmtUsd(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

interface Props {
  balance: string | undefined;
  isLoading: boolean;
  isError: boolean;
  holdings?: TokenHolding[];
  totalUsd?: number;
}

/**
 * Balance focal point: when the wallet holds more than USDC, the USDC-equivalent TOTAL is
 * the big number and each token is itemized below. With only USDC it falls back to the plain
 * USDC balance. Shared by the desktop WalletCard and the mobile AccountBar for consistency.
 */
export function BalanceSummary({ balance, isLoading, isError, holdings, totalUsd }: Props) {
  const tokens = (holdings ?? []).filter((t) => parseFloat(t.amount) > 0);
  const multi = tokens.some((t) => t.symbol !== "USDC");
  const showTotal = multi && totalUsd != null && totalUsd > 0;

  return (
    <div>
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1">
        {showTotal ? "Total balance" : "Balance"}
      </p>

      {isLoading ? (
        <div className="h-9 w-32 bg-border rounded animate-pulse" />
      ) : isError ? (
        <p className="text-3xl font-bold text-text-secondary/40">—</p>
      ) : showTotal ? (
        <p className="font-mono text-3xl font-semibold text-text-primary tracking-tight">
          ${fmtUsd(totalUsd)}
          <span className="font-sans text-base font-medium text-text-secondary/50 ml-1.5">USDC</span>
        </p>
      ) : (
        <p className="font-mono text-3xl font-semibold text-text-primary tracking-tight">
          {balance ?? "$0.00"}
          <span className="font-sans text-base font-medium text-text-secondary/50 ml-1.5">USDC</span>
        </p>
      )}

      {showTotal && (
        <div className="mt-3 space-y-2">
          {tokens.map((t) => {
            const g = tokenGlyph(t.symbol);
            return (
              <div key={t.symbol} className="flex items-center gap-2.5">
                <span className={`shrink-0 h-6 w-6 rounded-full grid place-items-center text-xs font-bold ${g.cls}`}>
                  {g.ch}
                </span>
                <span className="text-sm text-text-secondary flex-1">{t.symbol}</span>
                <span className="font-mono text-sm text-text-primary tabular-nums">{fmtAmount(t.amount)}</span>
                {t.usd != null && (
                  <span className="font-mono text-xs text-text-secondary/40 tabular-nums w-16 text-right">${fmtUsd(t.usd)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
