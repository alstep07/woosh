"use client";

import { FIELD_CLS } from "@/shared/ui/Field";

export type RecipientRow = { to: string; amount: string };

interface Props {
  rows: RecipientRow[];
  onChange: (rows: RecipientRow[]) => void;
  minRows?: number;
  maxRows?: number;
  disabled?: boolean;
}

function glyphFor(v: string): string {
  const c = v.trim().replace(/^@/, "").charAt(0);
  return c ? c.toUpperCase() : "?";
}

/**
 * Editable list of (recipient, amount) rows for batch send / payroll forms. Each row
 * gets a glyph avatar derived from the recipient text, an inline remove button (hidden
 * below `minRows`), and a dashed "Add recipient" affordance below the list rather than a
 * bare "+" link, so it reads as a real list-building control.
 */
export function RecipientRows({ rows, onChange, minRows = 2, maxRows = 20, disabled }: Props) {
  function update(i: number, patch: Partial<RecipientRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    if (rows.length <= minRows) return;
    onChange(rows.filter((_, idx) => idx !== i));
  }
  function add() {
    if (rows.length >= maxRows) return;
    onChange([...rows, { to: "", amount: "" }]);
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            aria-hidden
            className="shrink-0 h-9 w-9 rounded-full grid place-items-center text-xs font-bold bg-blue-primary/10 text-blue-primary"
          >
            {glyphFor(row.to)}
          </span>
          <input
            type="text"
            value={row.to}
            onChange={(e) => update(i, { to: e.target.value })}
            placeholder="username or 0x…"
            disabled={disabled}
            className={`${FIELD_CLS} flex-1 min-w-0`}
          />
          <input
            type="number"
            inputMode="decimal"
            value={row.amount}
            onChange={(e) => update(i, { amount: e.target.value })}
            placeholder="0.00"
            disabled={disabled}
            className={`${FIELD_CLS} w-24 shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            disabled={disabled || rows.length <= minRows}
            aria-label="Remove recipient"
            className="shrink-0 h-9 w-9 grid place-items-center rounded-full text-text-secondary/40 hover:text-red-400 hover:bg-red-400/10 disabled:opacity-20 disabled:pointer-events-none transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={disabled || rows.length >= maxRows}
        className="w-full flex items-center justify-center gap-1.5 rounded-input border border-dashed border-white/[0.14] py-2.5 text-sm font-medium text-text-secondary/50 hover:text-blue-primary hover:border-blue-primary/30 hover:bg-blue-primary/[0.04] disabled:opacity-30 disabled:pointer-events-none transition-colors"
      >
        <span className="text-base leading-none">+</span> Add recipient
      </button>
    </div>
  );
}
