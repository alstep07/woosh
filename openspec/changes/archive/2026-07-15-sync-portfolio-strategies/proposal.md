## Why

`openspec/specs/` has no `portfolio-strategies` capability. Kind.Portfolio (V3.1,
hackathon DeFi track) is substantially implemented on this branch, code-complete on the
contract, cron, and modal sides. Syncing now gives an accurate baseline while the
feature is still fresh, ahead of merge to main.

## What Changes

- **Add** `portfolio-strategies` spec covering: weighted-leg allocation (bps sum to
  10000), Deposit-mode direct release, Sweep-mode `transferFrom` pulls with onchain
  threshold/cap enforcement, the one-time sweep allowance approval, cron quote-first
  all-or-skip fan-out with exact-amount refunds, and sweep strategies holding no
  contract balance
- No code changes, spec sync only

## Capabilities

### New Capabilities
- `portfolio-strategies`: `Kind.Portfolio` target-allocation strategies across
  USDC/EURC/cirBTC, funded either by a custodied per-period deposit or by sweeping the
  wallet balance above a threshold

### Modified Capabilities
<!-- none -->

## Impact

- No code changes
- Affects: `openspec/specs/portfolio-strategies/spec.md` (new)
- Source of truth used: `contracts/src/WooshStrategyRegistry.sol` (Portfolio-specific
  logic), `app/api/wallet/approve-sweep/`, `app/api/cron/execute-strategies/`
  (`runPortfolio`), `src/entities/strategy/lib/allocation.ts`,
  `src/widgets/CreateStrategyModal/`, `src/views/strategies/`
