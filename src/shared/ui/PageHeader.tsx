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
 * optional right-side action. Keeps Strategies/Savings/Invoices/Swap page tops identical.
 */
export function PageHeader({ title, subtitle, action, className = "mb-8" }: Props) {
  return (
    <div className={`flex items-center justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">{title}</h1>
        {subtitle && <div className="text-xs text-text-secondary/50 mt-0.5">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
