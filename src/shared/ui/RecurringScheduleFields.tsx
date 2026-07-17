"use client";

import { Field, FIELD_CLS, LABEL_CLS } from "@/shared/ui/Field";
import { INTERVAL_PRESETS } from "@/entities/strategy/lib/format";

interface Props {
  interval: number;
  onIntervalChange: (v: number) => void;
  periods: string;
  onPeriodsChange: (v: string) => void;
  funding: string;
  onFundingChange: (v: string) => void;
  suggestedFunding?: string;
}

/**
 * "How often" pills + runs/deposit fields shared by every recurring form (Payments'
 * recurring payment/payroll, Swap's recurring auto-buy). Extracted from
 * CreateStrategyModal so the three forms don't re-declare the same interval grid and
 * suggested-funding button.
 */
export function RecurringScheduleFields({
  interval,
  onIntervalChange,
  periods,
  onPeriodsChange,
  funding,
  onFundingChange,
  suggestedFunding,
}: Props) {
  return (
    <>
      <div>
        <span className={LABEL_CLS}>How often</span>
        <div className="grid grid-cols-3 gap-2">
          {INTERVAL_PRESETS.map((p) => (
            <button
              key={p.seconds}
              type="button"
              aria-pressed={interval === p.seconds}
              onClick={() => onIntervalChange(p.seconds)}
              className={`rounded-input py-2 text-sm font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40 ${
                interval === p.seconds
                  ? "border-blue-primary bg-blue-primary/10 text-text-primary"
                  : "border-border bg-border/30 text-text-secondary hover:text-text-primary"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2">
        <Field label="Number of runs" htmlFor="periods">
          <input
            id="periods"
            type="number"
            inputMode="numeric"
            value={periods}
            onChange={(e) => onPeriodsChange(e.target.value)}
            placeholder="∞ until empty"
            className={FIELD_CLS}
          />
        </Field>
        <Field
          label="Total to deposit"
          htmlFor="funding"
          labelEnd={
            suggestedFunding && suggestedFunding !== funding ? (
              <button
                type="button"
                onClick={() => onFundingChange(suggestedFunding)}
                className="text-xs text-blue-primary/70 hover:text-blue-primary transition-colors"
              >
                use {suggestedFunding}
              </button>
            ) : undefined
          }
        >
          <div className="relative">
            <input
              id="funding"
              type="number"
              inputMode="decimal"
              value={funding}
              onChange={(e) => onFundingChange(e.target.value)}
              placeholder="0.00"
              className={`${FIELD_CLS} pr-16`}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary/50">
              USDC
            </span>
          </div>
        </Field>
      </div>
    </>
  );
}
