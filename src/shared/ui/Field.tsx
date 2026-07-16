"use client";

import { InputHTMLAttributes, ReactNode } from "react";

/**
 * Shared form-field styling for the action modals (strategies, savings, invoices).
 * These class strings used to be re-declared per modal (fieldCls/labelCls/FIELD_CLS);
 * keep them here so every modal input looks and focuses the same.
 */
export const FIELD_CLS =
  "w-full bg-border/40 text-text-primary rounded-input px-3 py-2.5 text-sm border border-border focus:border-blue-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40 outline-none transition-colors placeholder:text-text-secondary/40";

export const LABEL_CLS = "block text-xs font-medium text-text-secondary mb-1.5";

interface FieldProps {
  label: string;
  htmlFor?: string;
  /** Right side of the label row, e.g. a Max button or a live hint. */
  labelEnd?: ReactNode;
  children: ReactNode;
  hint?: string;
}

/** Label row (with optional right-side slot) + control + optional hint line. */
export function Field({ label, htmlFor, labelEnd, children, hint }: FieldProps) {
  return (
    <div>
      {labelEnd ? (
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor={htmlFor} className="text-xs font-medium text-text-secondary">
            {label}
          </label>
          {labelEnd}
        </div>
      ) : (
        <label htmlFor={htmlFor} className={LABEL_CLS}>
          {label}
        </label>
      )}
      {children}
      {hint && <p className="text-[11px] text-text-secondary/50 mt-1.5">{hint}</p>}
    </div>
  );
}

interface AmountInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Right-side suffix inside the input, e.g. "USDC" or "%". */
  suffix?: string;
  /** Renders a small "Max" text button next to the label. */
  onMax?: () => void;
  hint?: string;
}

/**
 * Labeled numeric amount input with a right-side token suffix and an optional Max
 * button. The value stays a string end to end (no float math on money).
 */
export function AmountInput({ id, label, value, onValueChange, suffix, onMax, hint, ...props }: AmountInputProps) {
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      labelEnd={
        onMax ? (
          <button
            type="button"
            onClick={onMax}
            className="text-xs font-medium text-blue-primary/70 hover:text-blue-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40 rounded transition-colors"
          >
            Max
          </button>
        ) : undefined
      }
    >
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="0.00"
          className={`${FIELD_CLS} ${suffix ? "pr-16" : ""}`}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}
