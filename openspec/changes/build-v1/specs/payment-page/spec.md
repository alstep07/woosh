## ADDED Requirements

### Requirement: Payment page resolves recipient by slug
The `/pay/[slug]` route SHALL resolve the recipient's wallet address from the slug and display their payment form.

#### Scenario: Valid slug
- **WHEN** a user navigates to `/pay/alice`
- **THEN** the page SHALL display a payment form addressed to the recipient identified by slug "alice"

#### Scenario: Unknown slug
- **WHEN** a user navigates to `/pay/nonexistent`
- **THEN** the page SHALL display a 404-style message: "This payment link doesn't exist"

### Requirement: Amount entry
The payment page SHALL allow the sender to enter a USDC amount before connecting their wallet.

#### Scenario: Valid amount entered
- **WHEN** the sender types a positive numeric value into the amount field
- **THEN** the amount SHALL be stored and used when the payment transaction is initiated

#### Scenario: Invalid amount
- **WHEN** the sender enters zero, a negative number, or non-numeric input
- **THEN** the pay button SHALL remain disabled and an inline error SHALL be shown

### Requirement: Wallet connection
The payment page SHALL allow senders to connect an external EVM wallet via Wagmi (MetaMask, Coinbase Wallet, WalletConnect).

#### Scenario: Connect wallet
- **WHEN** the sender clicks "Connect Wallet"
- **THEN** a wallet selection modal SHALL appear with available connectors
- **THEN** after connection, the sender's address SHALL be displayed on the page

#### Scenario: Wrong network
- **WHEN** the connected wallet is on a chain other than Arc testnet
- **THEN** the page SHALL display a banner asking the sender to switch to Arc testnet
- **THEN** the pay button SHALL remain disabled until the correct network is selected

### Requirement: USDC balance check
After wallet connection the page SHALL check the sender's USDC balance on Arc.

#### Scenario: Sufficient balance
- **WHEN** the sender's USDC balance is greater than or equal to the entered amount
- **THEN** the pay button SHALL be enabled

#### Scenario: Insufficient balance
- **WHEN** the sender's USDC balance is less than the entered amount
- **THEN** the pay button SHALL be disabled and the inline banner "You need USDC on Arc to pay. Here's how to get some →" SHALL be displayed, linking to the onboarding guide at Step 2

### Requirement: USDC payment execution
The payment page SHALL execute a USDC transfer from the sender's wallet to the recipient's wallet address on Arc when the sender confirms.

#### Scenario: Successful payment
- **WHEN** the sender clicks "Pay" and confirms in their wallet
- **THEN** a USDC transfer for the entered amount SHALL be sent to the recipient's wallet on Arc
- **THEN** the page SHALL display a confirmation screen with the transaction hash and a success message

#### Scenario: User rejects in wallet
- **WHEN** the sender dismisses or rejects the transaction in their wallet
- **THEN** the page SHALL return to the payment form without error and allow the sender to retry

#### Scenario: Transaction fails on-chain
- **WHEN** the submitted transaction reverts or times out
- **THEN** the page SHALL display an error message with the option to retry
