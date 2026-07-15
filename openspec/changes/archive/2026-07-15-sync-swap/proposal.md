## Why

`openspec/specs/` has no `swap` capability. The manual swap feature at
`/dashboard/swap` (Synthra SynRoute rail, the only route provider with liquidity on Arc
testnet) needs an accurate spec baseline, especially its two-step UCW execution and
refund guarantees.

## What Changes

- **Add** `swap` spec covering: the two-step UCW swap flow (fund executor, then swap),
  executor balance polling, refund-on-failure guarantees, PIN cancellation, Synthra
  quote/swap API semantics (slippageBps is actually a percentage), transaction polling
  success states, and accurate amountOut measurement (balance delta, not event summing)
- No code changes, spec sync only

## Capabilities

### New Capabilities
- `swap`: manual token swap on `/dashboard/swap` via the Synthra SynRoute API and the
  DCW executor

### Modified Capabilities
<!-- none -->

## Impact

- No code changes
- Affects: `openspec/specs/swap/spec.md` (new)
- Source of truth used: `app/dashboard/swap/`, `app/api/wallet/swap/`,
  `src/shared/lib/synroute.ts`, `src/features/auth/model/useChallengeFlow.ts`
