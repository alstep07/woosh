## Context

Spec-sync change, no new design. Portfolio strategies extend `WooshStrategyRegistry`
with a `Kind.Portfolio` variant supporting two funding modes: Deposit (contract holds
custody for one period, mirrors existing Payment/DCA custody model) and Sweep (no
contract balance at all; funds are pulled from the owner's wallet via a one-time ERC-20
`approve` on the USDC precompile, bounded by an onchain threshold and per-period cap).

## Goals / Non-Goals

**Goals:** document the actual leg/allocation math, both funding modes, and the cron
fan-out/refund behavior.
**Non-Goals:** any code changes; this spec assumes `strategies` (Payment/DCA) is already
synced as a separate capability.

## Decisions

- The USDC ERC-20 precompile supports `approve`/`transferFrom` against native balance
  because it's a proxy contract whose `transferFrom` blocklist-checks the CALLER, not
  the token owner, making contract-initiated pulls work by design. Verified via
  `eth_simulateV1` and a fork test (a local fork EVM can't execute native precompiles
  directly).
- Cron quotes every leg before moving any funds (all-or-skip) so a single illiquid leg
  never leaves a strategy partially executed; refunds are always by exact per-leg
  amount, never a wallet balance scan, to avoid refunding unrelated funds.
