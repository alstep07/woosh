# invoices Specification

## Purpose
Onchain payment requests via `WooshInvoiceRegistry`: tamper-proof shareable `/i/[id]`
links, dashboard listing, and chat tool support.
## Requirements
### Requirement: Deterministic tamper-proof invoice ids
An invoice id SHALL be `keccak256(abi.encode(creator, salt))`, computable identically
onchain and client-side, so the id is fully determined by `(creator, salt)` and cannot be
forged or squatted by another address.

#### Scenario: Duplicate create rejected
- **WHEN** `create()` is called twice with the same `(creator, salt)` pair
- **THEN** the second call reverts with `"WIR: id exists"`

### Requirement: Shareable link carries only the invoice id
`/i/[id]` SHALL derive payee, amount, and memo exclusively from onchain state, never
from the URL, and SHALL reject malformed or unresolvable ids.

#### Scenario: Malformed or unknown id
- **WHEN** the id doesn't match `^0x[0-9a-fA-F]{64}$` or resolves to no invoice
- **THEN** the page renders "Invalid payment link"

### Requirement: Invoice creation stores amount and memo onchain
`create(salt, amount, memo)` SHALL require `amount > 0`, SHALL reject an id collision,
and SHALL store `payee`, `amount`, `memo`, `paid=false`, and `createdAt` onchain.

#### Scenario: Create via challenge/execute
- **WHEN** a user creates an invoice
- **THEN** `/api/wallet/create-invoice` builds a Circle contract-execution challenge and
  the client executes it via `sdk.execute` (PIN required) before computing the
  shareable id client-side

### Requirement: Payment requires exact amount match
`pay(id)` SHALL be payable, SHALL require `msg.value` to exactly equal the invoice
amount, and SHALL forward the full payment to the payee using checks-effects-interactions
ordering (state updated before the external call).

#### Scenario: Wrong amount rejected
- **WHEN** a payer sends `msg.value` different from the invoice amount
- **THEN** the transaction reverts with `"WIR: wrong amount"` and no state changes occur

#### Scenario: Already-paid invoice rejected
- **WHEN** `pay()` is called on an invoice with `paid == true`
- **THEN** the transaction reverts with `"WIR: already paid"`

### Requirement: Expired session falls back to OTP re-authentication
Both create-invoice and pay-invoice API routes SHALL return HTTP 401 on an expired or
invalid Circle token, and the client SHALL fall back to a fresh OTP step.

#### Scenario: Token expired mid-create
- **WHEN** `/api/wallet/create-invoice` detects an auth error
- **THEN** it returns 401, and the create modal clears cached/pending tokens and
  auto-sends a fresh OTP to the session email

### Requirement: /i/[id] shows paid vs unpaid state
`/i/[id]` SHALL render an "Already paid" card (memo only, no form) when the invoice is
paid, and a pre-filled, amount-locked payment form otherwise.

#### Scenario: Already paid
- **WHEN** an invoice's `paid` flag is true
- **THEN** `/i/[id]` renders an "Already paid" card with the memo and no payment form

#### Scenario: Unpaid
- **WHEN** an invoice is unpaid
- **THEN** `/i/[id]` renders the payment form pre-filled with the invoice amount and
  memo, with the amount input locked

### Requirement: My-invoices dashboard reads directly from chain
The dashboard SHALL read `getInvoiceIds(creator)` then `getInvoice` for each id in
parallel, showing newest-first, and SHALL poll periodically so paid status updates
without a manual refresh.

#### Scenario: Periodic refresh
- **WHEN** an invoice is paid by someone else while the dashboard is open
- **THEN** the dashboard's 15-second poll picks up the updated `paid` status without a
  page reload

### Requirement: Chat tool support for invoices
The chat agent SHALL support `get_invoices` (read-only summary) and
`create_payment_request(amount, memo)`, the latter requiring both fields before
returning a `pendingAction` rather than creating onchain directly.

#### Scenario: Missing memo
- **WHEN** the user asks to request payment without specifying a memo
- **THEN** the agent asks for the missing field instead of calling
  `create_payment_request`

