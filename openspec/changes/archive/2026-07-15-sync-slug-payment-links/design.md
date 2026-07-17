## Context

Spec-sync change, no new design. Slugs are a permanent one-to-one mapping enforced
onchain (`WooshSlugRegistry`), not a DB record, matching the project's no-off-chain-
storage-by-default rule.

## Goals / Non-Goals

**Goals:** document the actual slug registry contract surface and payment link
resolution/execution paths.
**Non-Goals:** any code changes.

## Decisions

- Payment links carry only an opaque identifier (slug or invoice id); recipient/amount
  are always re-derived from chain state, never trusted from the URL, to prevent link
  tampering.
- Two payment execution paths coexist: Circle challenge/execute (decimal-string amounts)
  for Woosh-managed wallets, and raw `parseUnits(amount, 18)` value transfer for
  externally connected wagmi wallets, since native USDC is 18 decimals on Arc.
