## Context

Spec-sync change, no new design. Circle App Kit / Stablecoin Service has no swap routes
on Arc testnet, so all swaps go through `trading-api.synthra.org` (SynRoute), executed by
the shared DCW executor rather than directly by the UCW user (who cannot sign
autonomous multi-step flows).

## Goals / Non-Goals

**Goals:** document the actual two-step swap flow and Synthra API integration details.
**Non-Goals:** any code changes.

## Decisions

- Because a UCW user can't be the swap signer for a server-orchestrated route, the swap
  is split: step 1 the user PIN-authorizes moving `tokenIn` to the executor; step 2 the
  server executes the swap from the executor and delivers output to the user.
- Actual swap output is measured via a balance-delta read across the swap transaction's
  block, not by summing Transfer events, because wrapped-native unwraps on the Synthra
  route emit duplicate Transfer events and live polling can catch unrelated concurrent
  transfers.
