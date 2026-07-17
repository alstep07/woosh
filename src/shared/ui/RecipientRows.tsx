"use client";

import { FIELD_CLS } from "@/shared/ui/Field";
import { useResolveRecipient } from "@/entities/slug/hooks/useResolveRecipient";
import { RecipientStatusIcon } from "@/shared/ui/RecipientStatusIcon";

// FIELD_CLS starts with "w-full" (it's designed for standalone full-width fields).
// Appending flex-1/w-24 on TOP of that put two competing width utilities on the same
// element; Tailwind's generated stylesheet order let w-full win for BOTH inputs, so
// the amount field (protected by shrink-0) rendered at ~100% width and the recipient
// field (no shrink protection, min-w-0) collapsed to near-zero, unusable. Stripping
// "w-full" here removes the conflict instead of trying to out-specificity it.
const FIELD_CLS_FLEX = FIELD_CLS.replace(/^w-full\s+/, "");

export type RecipientRow = { to: string; amount: string };

interface Props {
  rows: RecipientRow[];
  onChange: (rows: RecipientRow[]) => void;
  minRows?: number;
  maxRows?: number;
  disabled?: boolean;
  /** Addresses already paid before (from tx history), for the row's status icon. */
  knownAddresses?: string[];
}

/**
 * Editable list of (recipient, amount) rows for batch send / payroll forms. Each row
 * gets a static index badge (1, 2, 3…), an inline remove button (hidden below
 * `minRows`), and a dashed "Add recipient" affordance below the list rather than a bare
 * "+" link, so it reads as a real list-building control.
 *
 * The index badge used to be a dynamic glyph derived from whatever was typed in the
 * recipient field (first letter, live). That read as a second, broken input: users
 * would try typing directly into the circle, nothing happened, and the letter it did
 * show appeared to change "randomly" as they typed in the real field next to it. A
 * plain, static row number can't be mistaken for a control.
 */
export function RecipientRows({ rows, onChange, minRows = 2, maxRows = 20, disabled, knownAddresses }: Props) {
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
        <RecipientRowFields
          key={i}
          row={row}
          onToChange={(to) => update(i, { to })}
          onAmountChange={(amount) => update(i, { amount })}
          onRemove={() => remove(i)}
          index={i}
          canRemove={rows.length > minRows}
          disabled={disabled}
          knownAddresses={knownAddresses}
        />
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

/**
 * Split out from RecipientRows' map so each row owns its own useResolveRecipient
 * instance (a hook can't live inside a loop directly, and each row's input resolves
 * independently of the others).
 */
function RecipientRowFields({
  row,
  onToChange,
  onAmountChange,
  onRemove,
  index,
  canRemove,
  disabled,
  knownAddresses,
}: {
  row: RecipientRow;
  onToChange: (to: string) => void;
  onAmountChange: (amount: string) => void;
  onRemove: () => void;
  index: number;
  canRemove: boolean;
  disabled?: boolean;
  knownAddresses?: string[];
}) {
  const { status, resolvedAddress } = useResolveRecipient(row.to);

  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="shrink-0 h-9 w-9 rounded-full grid place-items-center text-xs font-bold bg-blue-primary/10 text-blue-primary"
      >
        {index + 1}
      </span>
      <div className="relative flex-1 min-w-0">
        <input
          type="text"
          value={row.to}
          onChange={(e) => onToChange(e.target.value)}
          placeholder="username or 0x…"
          disabled={disabled}
          className={`${FIELD_CLS_FLEX} w-full ${status !== "idle" ? "pr-8" : ""}`}
        />
        {status !== "idle" && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <RecipientStatusIcon status={status} resolvedAddress={resolvedAddress} knownAddresses={knownAddresses} />
          </span>
        )}
      </div>
      <input
        type="number"
        inputMode="decimal"
        value={row.amount}
        onChange={(e) => onAmountChange(e.target.value)}
        placeholder="0.00"
        disabled={disabled}
        className={`${FIELD_CLS_FLEX} w-24 shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled || !canRemove}
        aria-label="Remove recipient"
        className="shrink-0 h-9 w-9 grid place-items-center rounded-full text-text-secondary/40 hover:text-red-400 hover:bg-red-400/10 disabled:opacity-20 disabled:pointer-events-none transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
