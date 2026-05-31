## ADDED Requirements

### Requirement: Dashboard requires authentication
The `/dashboard` route SHALL only be accessible to authenticated users (active Circle session).

#### Scenario: Unauthenticated access
- **WHEN** an unauthenticated user navigates to `/dashboard`
- **THEN** the system SHALL redirect them to `/signup`

### Requirement: USDC balance display
The dashboard SHALL display the user's current USDC balance on Arc, read from the embedded wallet address via Viem.

#### Scenario: Balance loads successfully
- **WHEN** an authenticated user opens `/dashboard`
- **THEN** the dashboard SHALL fetch the USDC balance from Arc and display it as a USD-formatted amount (e.g., "$120.50")

#### Scenario: Balance fetch fails
- **WHEN** the Arc RPC call to fetch balance fails
- **THEN** the dashboard SHALL display "Balance unavailable" and SHALL NOT crash

### Requirement: Payment link display and copy
The dashboard SHALL display the user's personal payment link and provide a one-click copy action.

#### Scenario: Payment link shown
- **WHEN** an authenticated user views `/dashboard`
- **THEN** the dashboard SHALL display their payment link in the format `woosh.app/pay/<slug>`

#### Scenario: Copy link
- **WHEN** the user clicks the copy button next to the payment link
- **THEN** the link SHALL be copied to the clipboard and a brief confirmation message SHALL appear

### Requirement: Transaction history
The dashboard SHALL display a list of incoming USDC transactions for the user's wallet address, read from Arc via Viem.

#### Scenario: Transactions load
- **WHEN** an authenticated user opens `/dashboard`
- **THEN** the transaction list SHALL display each transaction with: sender address (truncated), amount in USDC, and relative timestamp (e.g., "2 hours ago")

#### Scenario: No transactions yet
- **WHEN** the wallet has no transaction history
- **THEN** the dashboard SHALL display an empty state message: "No payments yet. Share your link to get started."

#### Scenario: Transaction fetch fails
- **WHEN** the Arc RPC call to fetch transactions fails
- **THEN** the dashboard SHALL display an error state for the transaction list without crashing
