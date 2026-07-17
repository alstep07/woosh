/**
 * Shared display formatting for token amounts. Consolidates the fmtAmount pairs that
 * used to be copy-pasted in BalanceSummary and SavingsPage (and drifted, e.g. the
 * savings vault copy used toPrecision(2) for tiny values, which renders as scientific
 * notation like "1.2e-7"). Formatting only, never used for math: amounts stay
 * string/bigint everywhere else per the project's no-float-arithmetic-on-money rule.
 * Token icons live in src/shared/ui/TokenIcon.tsx (official Circle Brand Kit marks).
 */

/**
 * Human amount string -> display string. No scientific notation ever: values below
 * 0.000001 show as "<0.000001" (matching src/shared/lib/synroute.ts fmtOut), values below
 * 0.0001 render as fixed decimals with trailing zeros stripped, everything else uses
 * locale grouping.
 */
export function fmtAmount(amount: string): string {
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n > 0 && n < 0.000001) return "<0.000001";
  if (n < 0.0001) return n.toFixed(8).replace(/\.?0+$/, "");
  return n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : 2 });
}
