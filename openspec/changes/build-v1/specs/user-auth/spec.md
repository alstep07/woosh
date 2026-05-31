## ADDED Requirements

### Requirement: Email-based signup creates embedded wallet
The `/signup` page SHALL allow a user to register with an email address and SHALL trigger Circle Programmable Wallets to create an embedded wallet for the user upon successful registration.

#### Scenario: Successful signup
- **WHEN** a user submits a valid email address on `/signup`
- **THEN** the system SHALL create a Circle embedded wallet for that user
- **THEN** the system SHALL assign a unique payment slug derived from the email local part (e.g., "alex" from "alex@email.com")
- **THEN** the user SHALL be redirected to `/dashboard`

#### Scenario: Email already registered
- **WHEN** a user submits an email that already has a registered account
- **THEN** the system SHALL display an inline error: "An account with this email already exists"
- **THEN** no new wallet SHALL be created

### Requirement: Unique payment slug assignment
The system SHALL assign a unique payment slug to each registered user at signup time.

#### Scenario: Slug derived from email
- **WHEN** a new user registers with email "alice@example.com"
- **THEN** the system SHALL attempt to assign the slug "alice"

#### Scenario: Slug collision
- **WHEN** the derived slug is already taken
- **THEN** the system SHALL append a short numeric suffix (e.g., "alice1", "alice2") until a unique slug is found

### Requirement: User session established after signup
After successful registration the user SHALL be considered authenticated for the current session.

#### Scenario: Post-signup authentication
- **WHEN** registration completes successfully
- **THEN** the user SHALL be able to access `/dashboard` without re-entering credentials in the same browser session

### Requirement: Signup form validation
The signup form SHALL validate the email field before submission.

#### Scenario: Invalid email format
- **WHEN** a user submits a malformed email address (e.g., "notanemail")
- **THEN** the form SHALL display an inline validation error and SHALL NOT submit to the server

#### Scenario: Empty email field
- **WHEN** a user submits the form with an empty email field
- **THEN** the form SHALL display a required-field error and SHALL NOT submit
