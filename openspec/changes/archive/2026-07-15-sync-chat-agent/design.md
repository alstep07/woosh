## Context

Spec-sync change, no new design. `src/features/chat/model/registry.ts` and
`src/features/payments/chat-tools.ts` only register placeholder example strings for the
input typewriter effect — they are not the real tool registry. All actual tool
definitions and execution logic live in `app/api/chat/route.ts`.

## Goals / Non-Goals

**Goals:** document the actual tool set, agentic loop, and safety mechanisms.
**Non-Goals:** any code changes.

## Decisions

- Mutating tools (send_payment, create_payment_request, swap, create_strategy) never
  execute server-side; they return a `pendingAction` the client must confirm via PIN,
  keeping the agent from moving funds unilaterally.
- The client is the source of truth for action outcomes: bracketed status notes
  (`[Action completed successfully]` etc.) are appended to history so the model never
  re-proposes a stale or already-resolved action.
