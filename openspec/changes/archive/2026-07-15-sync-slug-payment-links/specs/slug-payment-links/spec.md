## ADDED Requirements

### Requirement: Slug format and permanence
A slug SHALL be 3-32 characters, lowercase `[a-z0-9_]` only, validated both client-side
and onchain. Each address SHALL be able to register at most one slug, ever; there is no
update, release, or transfer function.

#### Scenario: Invalid format rejected
- **WHEN** a user submits a slug with uppercase letters or fewer than 3 characters
- **THEN** client validation rejects it before submission, and even if bypassed the
  contract's `register` reverts with `"Invalid slug"`

#### Scenario: Address already has a slug
- **WHEN** an address that already registered a slug calls `register` again
- **THEN** the transaction reverts with `"Address already has a slug"`

### Requirement: Slug registration via challenge/execute, PIN required
Registration SHALL follow the challenge/execute pattern: the server creates a Circle
contract-execution challenge calling `register(string)`, and the client executes it via
`sdk.execute`, requiring the user's PIN.

#### Scenario: Slug taken between availability check and submission
- **WHEN** the execute call fails with an error mentioning "taken" or "already"
- **THEN** the UI shows "This username was just claimed. Please choose a different one."
  and offers alternative suggestions

#### Scenario: Suggestions on conflict
- **WHEN** a submitted slug is unavailable
- **THEN** the system offers 4 alternatives derived from the base slug (truncated to 28
  chars, with `+1`, `+2`, `+_pay`, `+2026` suffixes)

### Requirement: Debounced availability check
The system SHALL debounce (500ms) an onchain `isAvailable` read while the user types a
candidate slug, and optimistically report available if the registry address is unset.

#### Scenario: Registry address unset
- **WHEN** `NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS` is not configured
- **THEN** `useSlugAvailability` returns `"available"` without making an RPC call

### Requirement: Payment link resolution never trusts the URL for recipient data
`/pay/[slug]` SHALL resolve the recipient address by reading the slug registry onchain
(or passing through a raw address for legacy V1 links), and SHALL show an "Invalid
payment link" state if resolution fails.

#### Scenario: Unregistered slug
- **WHEN** `/pay/<unregistered-slug>` is visited
- **THEN** `slugToAddress` returns the zero address, `resolveSlug` returns null, and the
  page renders "Invalid payment link"

#### Scenario: Invoice-backed link overrides slug
- **WHEN** the URL includes `?req=<invoice-id>`
- **THEN** payee, amount, and memo are read from `WooshInvoiceRegistry.getInvoice`
  instead of being derived from the `slug` path segment, which becomes cosmetic only

### Requirement: Amount prefill vs lock
For plain slug links, an `?amount=` query param SHALL prefill (not lock) the payment
amount. For invoice-backed links, the amount SHALL be locked to the onchain invoice
amount and the input disabled.

#### Scenario: Plain link with amount param
- **WHEN** `/pay/alex?amount=10` is visited
- **THEN** the payment form prefills `10` but the user may still edit it before paying

### Requirement: Dual payment execution paths
Sending a payment SHALL use Circle's challenge/execute flow (decimal-string amount, PIN
required) for Woosh-managed (UCW) wallets, and a raw native-token value transfer
(`parseUnits(amount, 18)`) for externally connected wallets.

#### Scenario: Woosh wallet payment
- **WHEN** a user pays via their Woosh wallet
- **THEN** `/api/wallet/send-payment` validates the amount, creates a Circle payment
  challenge with a decimal-string amount (native USDC, `tokenAddress: ""`), and the
  client executes it via `sdk.execute` for PIN confirmation

#### Scenario: External wallet payment
- **WHEN** a user pays via a connected external wallet (not Woosh-managed)
- **THEN** the amount is converted via `parseUnits(amount, 18)` and sent as `msg.value`
  directly to the recipient (or to `WooshInvoiceRegistry.pay(id)` if an invoice)

#### Scenario: Expired session during send
- **WHEN** the Circle userToken is expired or invalid
- **THEN** `/api/wallet/send-payment` returns HTTP 401 and the client falls back to a
  fresh OTP re-authentication step
