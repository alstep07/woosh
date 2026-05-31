## ADDED Requirements

### Requirement: Email-based signup creates user-controlled wallet
The `/signup` page SHALL allow a user to register with an email address using Circle User-Controlled Wallets (UCW) with email OTP authentication. The flow SHALL proceed in three steps: OTP request → OTP verification → wallet creation challenge.

#### Scenario: Successful OTP send
- **WHEN** a user enters a valid email address and submits the form on `/signup`
- **THEN** the system SHALL call `POST /api/wallet/request-otp` with the user's device ID and email
- **THEN** Circle SHALL send a one-time passcode to that email
- **THEN** the page SHALL advance to the verify step

#### Scenario: OTP verification via Circle SDK
- **WHEN** the user clicks "Enter verification code" on the verify step
- **THEN** the Circle W3SSdk SHALL open its hosted OTP verification iframe
- **THEN** upon successful verification, the SDK login callback SHALL fire with `userToken` and `encryptionKey`

#### Scenario: Wallet creation challenge
- **WHEN** the SDK login callback fires successfully
- **THEN** the system SHALL call `POST /api/wallet/initialize` with the `userToken`
- **THEN** Circle SHALL return a `challengeId` for EOA wallet creation on Arc testnet (blockchain: ARC-TESTNET)
- **THEN** the SDK SHALL execute the challenge using `userToken` and `encryptionKey`
- **THEN** upon challenge completion the system SHALL call `POST /api/wallet/complete` to fetch the wallet address, assign a slug, and save the user record
- **THEN** the user SHALL be redirected to `/dashboard`

#### Scenario: User already has a wallet (re-registration)
- **WHEN** `POST /api/wallet/initialize` returns error code 155106 (user already exists)
- **THEN** the system SHALL skip challenge creation and call `POST /api/wallet/complete` directly to retrieve the existing wallet address and slug

### Requirement: Unique payment slug assignment
The system SHALL assign a unique payment slug to each user at wallet completion time.

#### Scenario: Slug derived from email
- **WHEN** `POST /api/wallet/complete` is called for a new user with email "alice@example.com"
- **THEN** the system SHALL attempt to assign the slug "alice" (email local part, lowercased, non-alphanumeric chars removed)

#### Scenario: Slug collision
- **WHEN** the derived slug is already taken by an existing user
- **THEN** the system SHALL append a numeric suffix (e.g., "alice1", "alice2") until a unique slug is found

#### Scenario: Idempotent completion
- **WHEN** `POST /api/wallet/complete` is called for an email that already has a saved record
- **THEN** the system SHALL return the existing `{slug, walletAddress}` without creating a duplicate

### Requirement: User session established after signup
After wallet creation completes, the user SHALL be authenticated for the current browser session.

#### Scenario: Post-signup session storage
- **WHEN** `POST /api/wallet/complete` succeeds
- **THEN** the client SHALL store `{email, slug, walletAddress}` in localStorage under the key `woosh_session`
- **THEN** the user SHALL be redirected to `/dashboard` and SHALL be able to view their balance and payment link without re-authenticating

### Requirement: Signup page multi-step state
The `/signup` page SHALL manage three distinct UI states corresponding to the three steps of the UCW email OTP flow.

#### Scenario: Email step (initial)
- **WHEN** the page first loads
- **THEN** the page SHALL show an email input and a "Send verification code" button
- **THEN** the button SHALL be disabled until Circle's W3SSdk has initialized and returned a device ID

#### Scenario: Verify step
- **WHEN** `POST /api/wallet/request-otp` succeeds
- **THEN** the page SHALL show "Check your email" with the submitted email address
- **THEN** a "Enter verification code" button SHALL trigger the Circle OTP iframe
- **THEN** a "Use a different email" link SHALL allow the user to return to the email step

#### Scenario: Creating step
- **WHEN** OTP verification succeeds and wallet initialization begins
- **THEN** the page SHALL show "Setting up your wallet…" with no interactive controls
