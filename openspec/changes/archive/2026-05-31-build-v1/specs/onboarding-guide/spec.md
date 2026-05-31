## ADDED Requirements

### Requirement: Onboarding guide trigger
The payment page SHALL display an "I don't know where to start" link that opens the onboarding guide overlay.

#### Scenario: Guide opened manually
- **WHEN** a sender clicks "I don't know where to start" on `/pay/[slug]`
- **THEN** the onboarding guide overlay SHALL appear starting at Step 1

#### Scenario: Guide opened from insufficient balance banner
- **WHEN** a sender clicks the "Here's how to get some →" link in the insufficient-balance banner
- **THEN** the onboarding guide SHALL appear starting at Step 2

### Requirement: Step 1 — Create a Woosh account
Step 1 of the onboarding guide SHALL instruct the sender to create a Woosh account so they receive an embedded wallet with no seed phrase.

#### Scenario: Step 1 content displayed
- **WHEN** the onboarding guide is at Step 1
- **THEN** the guide SHALL display: a brief explanation that creating a Woosh account gives them a wallet by email, and a CTA button that navigates to `/signup` in a new tab or the same tab

### Requirement: Step 2 — Get USDC via Arc testnet faucet
Step 2 of the onboarding guide SHALL provide a one-click mechanism for the sender to receive testnet USDC on Arc.

#### Scenario: Faucet request triggered
- **WHEN** the sender is at Step 2 and clicks "Get testnet USDC"
- **THEN** the guide SHALL call the Arc testnet faucet endpoint for the sender's connected wallet address
- **THEN** the guide SHALL display a success confirmation and prompt the sender to proceed to Step 3

#### Scenario: Step 2 without connected wallet
- **WHEN** the sender reaches Step 2 but has no wallet connected
- **THEN** the guide SHALL prompt them to connect their wallet before requesting faucet funds

### Requirement: Step 3 — Return and pay
Step 3 SHALL confirm the sender is ready and direct them back to the payment form to complete the transaction.

#### Scenario: Step 3 content displayed
- **WHEN** the onboarding guide is at Step 3
- **THEN** the guide SHALL display a confirmation that the sender is ready and a CTA that dismisses the guide and returns focus to the payment form

### Requirement: Guide is non-blocking and dismissible
The onboarding guide SHALL be dismissible at any step without losing the payment page state.

#### Scenario: Dismiss guide
- **WHEN** the sender closes the guide overlay at any step
- **THEN** the overlay SHALL close and the payment form SHALL remain intact with any previously entered amount preserved

### Requirement: Single linear path — no wallet choice menu
The onboarding guide SHALL present exactly one path (Woosh embedded wallet) and SHALL NOT display a wallet selector or list of alternatives.

#### Scenario: Guide shows single path
- **WHEN** the onboarding guide is open at Step 1
- **THEN** only the Woosh account creation path SHALL be presented
- **THEN** no list of external wallets (MetaMask, Coinbase, etc.) SHALL appear in the guide
