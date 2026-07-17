"use client";

import type { ReactNode } from "react";

interface Props {
  title: string;
  /** Optional line under the title (string or richer node, e.g. a live status row). */
  subtitle?: ReactNode;
  /** Optional right-side action, e.g. a "New" button. */
  action?: ReactNode;
  className?: string;
}

/**
 * Dashboard page header: title (text-2xl bold tracking-tight), optional subtitle,
 * optional right-side action. Keeps Payments/Swap/Savings/Invoices page tops identical.
 * The action slot commonly holds more than a single button now (a RefreshButton plus a
 * compact SegmentedControl mode switch, or a RefreshButton plus a primary CTA) — pass a
 * `<div className="flex items-center gap-3">` wrapping them, that's a plain child so no
 * API change was needed here.
 */
export function PageHeader({ title, subtitle, action, className = "mb-8" }: Props) {
  return (
    <div className={`flex ${subtitle ? "items-start" : "items-center"} justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">{title}</h1>
        {subtitle && <div className="text-xs text-text-secondary/50 mt-1.5 leading-relaxed">{subtitle}</div>}
      </div>
      {action && <div className={`shrink-0 ${subtitle ? "pt-0.5" : ""}`}>{action}</div>}
    </div>
  );
}
