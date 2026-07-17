## Context

Spec-sync change, no new design. Invoices were originally planned as a Supabase-backed
`/r/[id]` flow; the shipped implementation went fully onchain instead, resolving the
"invoice dashboard needs a DB" concern without adding off-chain storage.

## Goals / Non-Goals

**Goals:** document the actual onchain invoice contract and link/dashboard behavior.
**Non-Goals:** any code changes.

## Decisions

- Invoice id is deterministic (`keccak256(creator, salt)`), computed identically
  client-side and onchain, so the shareable link is available immediately after
  `create()` without a read-back round trip, and ids can't be squatted by others.
- The share link carries only the id; amount/memo/payee are always re-read from chain,
  never trusted from the URL.
