## Why

`openspec/specs/` has no `chat-agent` capability. The Woosh Agent chat (V2a/V2b) is a
first-class interface per CLAUDE.md ("every new feature ships with a chat tool"), so its
actual tool surface and safety behaviors need an accurate spec baseline.

## What Changes

- **Add** `chat-agent` spec covering: the 9 registered tools, the agentic loop and its
  tool_calls handling, token alias normalization, the pendingAction confirmation
  pattern, outcome annotation of chat history, history caps, rate limiting, and copy
  style enforcement
- No code changes, spec sync only

## Capabilities

### New Capabilities
- `chat-agent`: Claude-powered chat assistant (via OpenRouter) with tool-calling for
  balance/history/payments/invoices/strategies/swaps, confirm-before-execute UX

### Modified Capabilities
<!-- none -->

## Impact

- No code changes
- Affects: `openspec/specs/chat-agent/spec.md` (new)
- Source of truth used: `app/api/chat/route.ts`, `src/widgets/ChatPanel/`
