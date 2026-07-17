## ADDED Requirements

### Requirement: Registered tool set
The agent SHALL expose 9 function tools: `get_balance`, `get_transaction_history`,
`resolve_slug`, `send_payment`, `get_invoices`, `create_payment_request`, `swap`,
`get_strategies`, `create_strategy` (the last one covers Portfolio via a `kind`
parameter, not a separate tool).

#### Scenario: Strategy listing
- **WHEN** the user asks "what strategies do I have?"
- **THEN** the model calls `get_strategies`

### Requirement: Agentic loop acts on tool_calls regardless of finish_reason
The loop SHALL run up to 4 iterations, calling the model with `tool_choice: "auto"`, and
SHALL act on `tool_calls` whenever present without gating on `finish_reason ===
"tool_calls"`, since some OpenRouter providers return `finish_reason: "stop"` alongside
tool_calls.

#### Scenario: Iteration budget exhausted
- **WHEN** 4 iterations complete without a final text-only response
- **THEN** the API returns a fallback "Sorry, I couldn't complete that. Please try
  again." message

### Requirement: Token alias normalization
The system SHALL normalize token aliases (bitcoin/BTC/wBTC/XBT to cirBTC; euro/EUR to
EURC) both at the code level (`normalizeTokenSymbol`) and via system prompt instruction,
for `swap` and `create_strategy` token/allocation parameters.

#### Scenario: Bitcoin alias in a swap request
- **WHEN** the user says "buy some bitcoin with 5 usdc"
- **THEN** `swap` is called with `token: "cirBTC"`, `action: "buy"`, `amount: "5"`

### Requirement: pendingAction confirmation for mutating tools
The agent SHALL return a `pendingAction` for client-side PIN/OTP confirmation instead of
executing directly, for any mutating tool: `send_payment`, `create_payment_request`,
`swap`, or `create_strategy`. Read-only tools execute server-side and feed results back
into the loop.

#### Scenario: Payment proposal
- **WHEN** the user says "pay alex 10 usdc" and the slug resolves
- **THEN** the response is `{text, pendingAction: {type: "send_payment", to, amount,
  resolvedAddress}}` with no onchain action taken

#### Scenario: Sweep portfolio requires two PIN prompts
- **WHEN** a pendingAction proposes a Sweep-mode portfolio strategy and the caller's
  sweep allowance is insufficient
- **THEN** the client runs a one-time approve-sweep PIN challenge before the
  create-strategy PIN challenge

### Requirement: Outcome annotation prevents stale re-proposals
Before each request, the client SHALL append a bracketed ground-truth note to any prior
action message: completed, cancelled, failed, or still awaiting confirmation. The system
prompt SHALL instruct the model to treat these as authoritative and never re-propose a
resolved action.

#### Scenario: Failed payment is not retried silently
- **WHEN** a proposed payment fails to execute
- **THEN** the next chat request includes "[This action FAILED to execute.]" appended to
  that message, and the model does not claim it succeeded

### Requirement: History caps and error exclusion
Chat history SHALL be capped at 30 messages client-side and re-capped at 24
server-side; cancelled and error messages SHALL be excluded from the payload sent to the
model.

#### Scenario: Aborted message excluded from future requests
- **WHEN** a user aborts an in-flight message
- **THEN** it is flagged cancelled and excluded from all subsequent request payloads

### Requirement: Rate limiting
The chat API SHALL rate-limit to 10 requests per minute per `walletAddress:ip` key,
returning HTTP 429 with `isError: true` on excess.

#### Scenario: Excess requests rejected
- **WHEN** a caller exceeds 10 requests in a rolling minute
- **THEN** the API returns HTTP 429 with `isError: true` instead of calling the model

### Requirement: Copy style enforcement in system prompt
The system prompt SHALL instruct the model to never use em/en dashes (commas or periods
instead) and to spell "onchain" as one word, matching project-wide copy rules.

#### Scenario: Model avoids long dashes
- **WHEN** the model drafts a chat response
- **THEN** it uses commas or periods instead of em/en dashes, and writes "onchain" as one
  word, per the system prompt instruction (a prompt-level constraint, not code-enforced)
