## Context

Spec-sync change, no new design. Recurring payments are fully trustless (the contract
forwards funds directly; the executor only pays gas to trigger). DCA is semi-custodial
for exactly one period at a time: `releaseForSwap` hands the executor one period's USDC,
which it swaps via Synthra SynRoute and delivers straight to the owner, bounding
executor risk to a single period.

## Goals / Non-Goals

**Goals:** document the actual recurring/DCA contract mechanics, executor model, and
cron behavior.
**Non-Goals:** any code changes; Kind.Portfolio (covered separately in
`sync-portfolio-strategies`).

## Decisions

- The executor is a single shared Circle Developer-Controlled Wallet (no PIN); the
  contract enforces `onlyExecutor` so only the admin-registered address can trigger
  releases.
- Cron is scheduler-agnostic and idempotent by construction: `nextRunAt` is advanced
  onchain before funds move, so a re-triggered or overlapping cron run cannot
  double-execute a strategy.
