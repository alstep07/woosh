"use client";

import type { ReactNode } from "react";

interface Props {
  /** Big faded decorative glyph, e.g. "↻" or "◔". */
  glyph: string;
  primary: string;
  secondary?: ReactNode;
  /** Optional CTA, e.g. a Button. */
  cta?: ReactNode;
  className?: string;
}

/**
 * Empty-list state shared by the Strategies/Savings/Invoices pages: big faded glyph,
 * primary line, secondary line, optional CTA underneath.
 */
export function EmptyState({ glyph, primary, secondary, cta, className = "py-16 text-center" }: Props) {
  return (
    <div className={className}>
      <div aria-hidden className="text-3xl mb-4 opacity-20">{glyph}</div>
      <p className="text-text-secondary/60 text-sm">{primary}</p>
      {secondary && <div className={`text-text-secondary/35 text-xs mt-1 ${cta ? "mb-6" : ""}`}>{secondary}</div>}
      {cta}
    </div>
  );
}
