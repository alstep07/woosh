"use client";

import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "default" | "accent" | "danger";
}

const TONES: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-text-secondary/55 hover:text-text-primary hover:bg-white/[0.07]",
  accent: "text-blue-primary/70 hover:text-blue-primary hover:bg-blue-primary/10",
  danger: "text-red-400/60 hover:text-red-400 hover:bg-red-400/10",
};

/**
 * Quiet inline row action (Fund / Pause / Resume / Cancel) shared by the Automations
 * and Savings plan rows. A real hit area (px/py) and pill hover state instead of a bare
 * text link, so the row reads as a designed list rather than debug output.
 */
export function ActionPill({ tone = "default", className = "", ...props }: Props) {
  return (
    <button
      type="button"
      className={`text-xs font-medium px-2.5 py-1.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40 ${TONES[tone]} ${className}`}
      {...props}
    />
  );
}
