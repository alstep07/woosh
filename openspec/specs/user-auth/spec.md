# user-auth Specification

## Purpose
Passwordless email-OTP signup via Circle User-Controlled Wallets, wallet
initialization, session/token storage, and the optional post-signup slug claim.
## Requirements
### Requirement: Passwordless email-OTP signup
Signup SHALL require only an email address, no password. The system SHALL fetch a
Circle `deviceId` before allowing any auth action, and disable submission until it is
present.

#### Scenario: Device ID fetch fails
- **WHEN** `fetchDeviceId` fails or times out
- **THEN** the signup page shows a "Service not available in your region" state instead
  of the email form

#### Scenario: OTP requested
- **WHEN** a user submits a valid email with a `deviceId` present
- **THEN** the client POSTs `{deviceId, email}` to `/api/wallet/request-otp`, which
  returns `{deviceToken, deviceEncryptionKey, otpToken}` for the Circle W3S SDK to open
  a hosted OTP verification popup

### Requirement: UCW wallet creation, never DCW, for regular users
The platform SHALL use Circle User-Controlled Wallets exclusively for end users; the PIN
is entered client-side through the Circle SDK and never transits the server. The server
only creates challenges; the client executes them.

#### Scenario: Wallet initialization after OTP success
- **WHEN** OTP verification succeeds and `/api/wallet/initialize` is called with the
  userToken
- **THEN** the server attempts `createUserPinWithWallets`; if Circle reports the user is
  already initialized, it checks `getUserWallets` and returns `{alreadyExists: true}`
  (skipping the PIN step) if wallets exist, or a fresh wallet-creation `challengeId`
  otherwise
- **AND** the client executes any returned `challengeId` via `sdk.execute` (PIN entry)
  unless `alreadyExists` is true

#### Scenario: Wallet address polling after creation
- **WHEN** `/api/wallet/complete` is called after challenge execution
- **THEN** it retries `getUserWallets` up to 5 times with increasing backoff (800ms ×
  attempt) to absorb Circle propagation lag, returning 404 only if still not found

### Requirement: Session and token storage separation
The system SHALL persist three distinct classes of `woosh_*` state: a permanent
localStorage profile (`woosh_session`: email, walletAddress, slug), sessionStorage
"cached" tokens reused to skip re-OTP on later actions, and sessionStorage "pending"
tokens for a one-shot handoff from signup to slug-setup. All storage access SHALL be
wrapped in try/catch for Safari private-mode compatibility.

#### Scenario: Session established after wallet creation
- **WHEN** wallet creation completes
- **THEN** `setSession({email, walletAddress, slug?})` writes to
  `localStorage["woosh_session"]`, with slug lookup failing open (an RPC error never
  blocks the user)

#### Scenario: Expired token during a later on-chain action
- **WHEN** any on-chain action (slug register, payment, strategy) receives a 401 from
  its API route
- **THEN** both cached and pending tokens are cleared and the flow resets to a fresh OTP
  step

### Requirement: Slug claim is optional after signup
The system SHALL NOT force slug registration after signup. If no slug resolves for the
new wallet, the user SHALL be offered a suggested slug (derived from the email
local-part) with the choice to claim it or skip to the dashboard.

#### Scenario: Existing slug found
- **WHEN** a slug already resolves for the newly created wallet address
- **THEN** the user is routed directly to `/dashboard`, bypassing the claim prompt

#### Scenario: No slug found
- **WHEN** no slug resolves for the wallet
- **THEN** the signup page shows "Claim a username" (→ `/slug-setup`) and "Skip for now"
  (→ `/dashboard`) options

### Requirement: Already-signed-in guard
The signup page SHALL detect an existing local session and prevent re-signup without an
explicit choice to switch accounts.

#### Scenario: Existing session on signup page
- **WHEN** `localStorage["woosh_session"]` already exists on mount
- **THEN** the page shows "You're already signed in" with links to `/dashboard` or
  "Sign up with a different account", the latter clearing all `woosh_*` keys

### Requirement: No-funds warning before slug registration
Since slug registration is itself an on-chain PIN transaction, the slug-setup page SHALL
warn the user and surface the wallet address and faucet link when their balance is zero.

#### Scenario: Zero balance at slug setup
- **WHEN** the wallet's native USDC balance is `0`
- **THEN** the slug-setup page shows a warning with a copyable wallet address and a
  testnet faucet link before allowing registration

