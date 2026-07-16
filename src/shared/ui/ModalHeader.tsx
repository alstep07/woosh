"use client";

import type { ReactNode } from "react";

interface Props {
  title: string;
  /** One-line purpose statement under the title. */
  subtitle?: ReactNode;
  /** Optional glyph/icon badge to the left of the title. */
  icon?: ReactNode;
  iconClassName?: string;
}

/**
 * Shared modal header: optional icon badge + title + one-line purpose subtitle.
 * Keeps CreateStrategyModal/CreateSavingsModal/StrategyActionModal/SavingsActionModal/
 * CreateInvoiceModal all reading the same way at a glance. `pr-6` clears the modal's
 * fixed top-right close button.
 */
export function ModalHeader({ title, subtitle, icon, iconClassName = "bg-blue-primary/10 text-blue-primary" }: Props) {
  return (
    <div className="flex items-start gap-3 pr-6">
      {icon && (
        <span className={`shrink-0 h-9 w-9 rounded-full grid place-items-center text-base font-bold ${iconClassName}`}>
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-text-primary leading-tight">{title}</h2>
        {subtitle && <p className="text-sm text-text-secondary mt-1 leading-relaxed">{subtitle}</p>}
      </div>
    </div>
  );
}
