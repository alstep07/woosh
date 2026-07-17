/**
 * Shared amount validation for USDC-denominated form inputs (Send/Swap recurring +
 * batch forms). Up to 6 decimals, matching CreateStrategyModal's AMOUNT_RE — kept here
 * so new forms don't re-declare the same regex. Amounts stay strings end to end, no
 * float math on money.
 */
export const AMOUNT_RE = /^\d+(\.\d{1,6})?$/;

export function isValidAmount(value: string): boolean {
  const t = value.trim();
  return AMOUNT_RE.test(t) && parseFloat(t) > 0;
}
