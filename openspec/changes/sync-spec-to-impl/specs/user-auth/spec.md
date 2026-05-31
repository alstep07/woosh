## MODIFIED Requirements

### Requirement: Email-based signup creates embedded wallet
The `/signup` page SHALL allow a user to register with an email address using a 3-step OTP flow powered by Circle User-Controlled Wallets. The user SHALL receive an OTP by email, verify it in Circle's hosted UI, and approve a wallet creation challenge — all within the `/signup` page.

#### Scenario: Successful OTP send
- **WHEN** a user submits a valid email address on `/signup`
- **THEN** the system SHALL call `POST /api/wallet/request-otp` with the user's email and Circle device ID
- **THEN** Circle SHALL send a one-time passcode to that email
- **THEN** the page SHALL advance to the verify step showing "Check your email"

#### Scenario: OTP verification
- **WHEN** the user clicks "Enter verification code" on the verify step
- **THEN** the Circle W3SSdk SHALL open its hosted OTP verification iframe
- **THEN** upon successful verification, the SDK login callback SHALL fire with a `userToken` and `encryptionKey`

#### Scenario: Wallet creation
- **WHEN** the SDK login callback fires successfully
- **THEN** the system SHALL call `POST /api/wallet/initialize` with the `userToken`
- **THEN** Circle SHALL return a `challengeId` for wallet creation on Arc testnet (chain: EOA, blockchain: ARC-TESTNET)
- **THEN** the SDK SHALL execute the challenge using `userToken` and `encryptionKey`
- **THEN** upon challenge completion, the system SHALL call `POST /api/wallet/complete` to fetch the wallet address, assign a slug, and save the user record
- **THEN** the session SHALL be stored in localStorage as `{email, slug, walletAddress}`
- **THEN** the user SHALL be redirected to `/dashboard`

#### Scenario: User already has a wallet
- **WHEN** Circle returns error code 155106 during `POST /api/wallet/initialize`
- **THEN** the system SHALL skip challenge creation and call `POST /api/wallet/complete` directly to retrieve the existing wallet and slug

### Requirement: Unique payment slug assignment
The system SHALL assign a unique payment slug to each registered user at wallet completion time.

#### Scenario: Slug derived from email
- **WHEN** `POST /api/wallet/complete` is called for a new user with email "alice@example.com"
- **THEN** the system SHALL attempt to assign the slug "alice"

#### Scenario: Slug collision
- **WHEN** the derived slug is already taken by an existing user
- **THEN** the system SHALL append a numeric suffix (e.g., "alice1", "alice2") until a unique slug is found

#### Scenario: Idempotent completion
- **WHEN** `POST /api/wallet/complete` is called for an email that already has a saved user record
- **THEN** the system SHALL return the existing `{slug, walletAddress}` without creating a duplicate record

### Requirement: User session established after signup
After wallet creation completes, the user SHALL be considered authenticated for the current browser session.

#### Scenario: Post-signup authentication
- **WHEN** `POST /api/wallet/complete` succeeds
- **THEN** the client SHALL store `{email, slug, walletAddress}` in localStorage under key `woosh_session`
- **THEN** the user SHALL be redirected to `/dashboard` and SHALL be able to view their balance and payment link without re-authenticating

### Requirement: Signup page multi-step state
The `/signup` page SHALL manage three distinct UI states.

#### Scenario: Email step
- **WHEN** the page first loads
- **THEN** the page SHALL show an email input and a "Send verification code" button
- **THEN** the button SHALL be disabled until Circle's SDK has initialized and a device ID is available

#### Scenario: Verify step
- **WHEN** the OTP request succeeds
- **THEN** the page SHALL show "Check your email" with the submitted email address
- **THEN** a "Enter verification code" button SHALL be shown to trigger the Circle OTP iframe
- **THEN** a "Use a different email" link SHALL allow the user to return to the email step

#### Scenario: Creating step
- **WHEN** OTP verification succeeds and wallet initialization begins
- **THEN** the page SHALL show "Setting up your wallet…" with no interactive controls

## REMOVED Requirements

### Requirement: Signup form validation
**Reason**: The original spec included client-side validation with inline error messages for empty/malformed email. The UCW flow submits the email to Circle's API which returns its own validation errors. Client-side email format validation was removed in favor of API-driven errors.
**Migration**: Email errors surface as API error messages from `POST /api/wallet/request-otp`.

### Requirement: Email already registered error
**Reason**: DCW showed a 409 "An account with this email already exists" error. UCW email OTP handles re-authentication natively — returning users receive a new OTP and their existing wallet is retrieved via the `alreadyExists` path in `/api/wallet/initialize`.
**Migration**: Re-registration silently recovers the existing account. No error is shown.
