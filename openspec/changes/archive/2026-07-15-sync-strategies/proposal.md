## Why

`openspec/specs/` has no `strategies` capability. Automated strategies (V3.0, recurring
payments + DCA) are a core differentiator (trustless recurring, semi-custodial DCA via
DCW executor) and need an accurate spec baseline before V3.1 portfolio work is synced on
top.

## What Changes

- **Add** `strategies` spec covering: trustless recurring payment forwarding,
  one-period-bounded DCA release + Synthra swap + refund-on-failure, the DCW executor
  model, cron auth/idempotency/time-boxing, the USDC 18-vs-6 decimals conversion, and
  the fund/pause/resume/cancel lifecycle
- No code changes, spec sync only

## Capabilities

### New Capabilities
- `strategies`: `WooshStrategyRegistry`-backed recurring payments (Kind.Payment) and
  dollar-cost-averaging auto-buys (Kind.DCA), executed by the shared DCW executor on a
  cron schedule

### Modified Capabilities
<!-- none -->

## Impact

- No code changes
- Affects: `openspec/specs/strategies/spec.md` (new)
- Source of truth used: `contracts/src/WooshStrategyRegistry.sol` (Payment/DCA logic),
  `src/shared/lib/dcw.ts`, `app/api/cron/execute-strategies/`,
  `app/api/wallet/{create-strategy,fund-strategy,manage-strategy}`,
  `src/shared/lib/synroute.ts`
