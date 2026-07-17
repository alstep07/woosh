"use client";

import type { ReactNode } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Optional decorative glyph shown before the label. */
  glyph?: ReactNode;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label"?: string;
  /** "md" (default) is the full-width tray used in create-strategy forms. "sm" is a
   *  compact, content-width variant sized to sit inline next to a page title (e.g. in
   *  PageHeader's action slot) rather than taking its own full-width row. */
  size?: "md" | "sm";
}

/**
 * The pill-in-a-tray segmented picker (grid p-1 bg-border/30, active segment filled
 * blue with glow), extracted from CreateStrategyModal's kind switcher so any two-or-more
 * way mode toggle looks the same.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, size = "md", ...rest }: Props<T>) {
  const compact = size === "sm";
  return (
    <div
      role="group"
      aria-label={rest["aria-label"]}
      className={`${compact ? "inline-grid" : "grid"} gap-1 p-1 bg-border/30 rounded-input`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex items-center justify-center gap-1.5 rounded-[5px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40 ${
            compact ? "px-3 py-1.5 text-xs" : "py-2 text-sm"
          } ${
            value === o.value
              ? "bg-blue-primary text-white shadow-glow"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          {o.glyph && (
            <span aria-hidden className="text-base leading-none">
              {o.glyph}
            </span>
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}
