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
      <div
        aria-hidden
        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.04] text-2xl text-text-secondary/30"
      >
        {glyph}
      </div>
      <p className="text-text-secondary/70 text-sm font-medium">{primary}</p>
      {secondary && (
        <div className={`text-text-secondary/40 text-xs mt-1.5 leading-relaxed max-w-xs mx-auto ${cta ? "mb-6" : ""}`}>
          {secondary}
        </div>
      )}
      {cta}
    </div>
  );
}
