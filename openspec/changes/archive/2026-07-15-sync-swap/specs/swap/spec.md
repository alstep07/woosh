## ADDED Requirements

### Requirement: Two-step UCW swap flow
A swap SHALL be split into two steps: the user PIN-authorizes a transfer of `tokenIn` to
the executor wallet, then a server route swaps from the executor and delivers output
directly to the user.

#### Scenario: USDC to EURC swap initiation
- **WHEN** a user submits a USDC to EURC swap
- **THEN** `/api/wallet/swap` creates a Circle payment challenge (native transfer for
  USDC, or an ERC-20 token-transfer challenge for other tokens) moving `tokenIn` to the
  executor

### Requirement: Executor balance polling before swap execution
The execute route SHALL poll the executor's `tokenIn` balance up to 5 times (2s apart)
before concluding funds were not received, to absorb sub-second Arc finality races.

#### Scenario: Funds never arrive
- **WHEN** the executor balance never reaches the required amount within 5 polling
  attempts
- **THEN** the route responds with HTTP 409 "Funds not received"

### Requirement: Refund guarantee after funds are confirmed
Once funds are confirmed in the executor, any failure during swap execution SHALL
trigger a best-effort refund of the executor's balance (minus a gas buffer for native
USDC) back to the owner.

#### Scenario: Swap execution throws after funding confirmed
- **WHEN** the swap step throws after the executor balance check has passed
- **THEN** the executor refunds its balance to the owner and the response includes
  `refunded: true`

### Requirement: PIN cancellation escapes a frozen challenge window
Cancelling mid-challenge SHALL immediately return the flow to idle and SHALL discard any
late callback from the Circle SDK.

#### Scenario: Cancel during PIN entry
- **WHEN** the user cancels while `sdk.execute`'s PIN callback has not yet fired
- **THEN** the flow returns to idle immediately, and the eventual late callback (success
  or error) is silently ignored

### Requirement: Synthra quote/swap API and slippage semantics
The system SHALL call `POST /v1/quote` to check route viability and `POST /v1/swap` to
get executable calldata. The `slippageBps` parameter SHALL be treated as a percentage
(not true basis points), clamped to `[0.5, 25]`.

#### Scenario: Client-supplied slippage clamped
- **WHEN** a client requests `slippage: 100`
- **THEN** the execute route clamps it to 25 (25%) before passing it to the swap API

### Requirement: Transaction polling recognizes only terminal success states
Swap status polling SHALL treat only `COMPLETE` and `CONFIRMED` as success, SHALL
swallow transient poll errors by retrying rather than aborting, and SHALL trigger a
refund on any other terminal or timeout state.

#### Scenario: Transient poll error
- **WHEN** a status poll call throws due to an RPC hiccup
- **THEN** the error is logged and polling continues rather than failing the swap
  immediately

### Requirement: Actual swap output measured by balance delta, not event summation
`amountOut` SHALL be computed as the recipient's token balance delta across the swap
transaction's block via direct RPC reads, never by summing Transfer events or explorer
token-transfer logs.

#### Scenario: Wrapped-native unwrap in the route
- **WHEN** the Synthra route unwraps a wrapped-native token as part of the swap,
  emitting duplicate Transfer events
- **THEN** the balance-delta measurement still reports the correct single credit,
  avoiding a 2x over-count

### Requirement: Amount formatting avoids scientific notation
Reported swap amounts SHALL never render in scientific notation; values below
`0.000001` (but greater than zero) SHALL render as `"<0.000001"`.

#### Scenario: Very small output amount
- **WHEN** the measured output is `0.0000003`
- **THEN** it displays as `"<0.000001"` rather than `"3e-7"`

### Requirement: Fallback order for output measurement
The system SHALL attempt block-delta balance reading first, then a live balance-delta
comparison if the block-delta read is unavailable, then fall back to the pre-swap quote
marked as inexact.

#### Scenario: Both delta reads fail
- **WHEN** neither block-delta nor live-delta balance reads observe an increase
- **THEN** the response falls back to the build-time quote with `exact: false`, and the
  UI prefixes the displayed amount with `≈`
