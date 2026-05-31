## MODIFIED Requirements

### Requirement: CTA routes logged-in users directly to dashboard
When a session exists in localStorage, the "Get your payment link" CTA SHALL navigate directly to `/dashboard` without passing through `/signup`.

#### Scenario: Logged-in user clicks CTA
- **WHEN** `woosh_session` is present in localStorage and user clicks "Get your payment link"
- **THEN** browser navigates to `/dashboard`

#### Scenario: Logged-out user clicks CTA
- **WHEN** no `woosh_session` exists and user clicks "Get your payment link"
- **THEN** browser navigates to `/signup`

### Requirement: No em-dash characters in visible copy
The landing page SHALL contain no `—` (em-dash) characters in any user-visible text.

#### Scenario: Hero copy audit
- **WHEN** landing page renders
- **THEN** no em-dash character appears in the headline, subheadline, or any other visible text

### Requirement: Full-screen animated background
The dot animation layer SHALL be `position: fixed; inset: 0` so it covers the full viewport at all scroll positions.

#### Scenario: User scrolls past hero
- **WHEN** user scrolls down to the "How it works" section
- **THEN** animated dots are still visible in the background behind the cards

#### Scenario: Animation does not intercept clicks
- **WHEN** animation layer is visible
- **THEN** all buttons, links, and inputs remain fully interactive (`pointer-events: none` on animation layer)

### Requirement: How it works — three personas
The "How it works" section SHALL present three columns covering: receiving, sending as a human, and sending as an AI agent.

#### Scenario: Three columns rendered
- **WHEN** landing page loads
- **THEN** exactly three cards are shown: one for recipients, one for human senders, one for AI agents

#### Scenario: AI agent column copy
- **WHEN** AI agent column is visible
- **THEN** copy describes a programmatic API flow with no mention of UI steps (no "click", "tap", etc.)

### Requirement: Glassmorphism card style
"How it works" cards SHALL use a semi-transparent glass style that lets the animated background show through.

#### Scenario: Card transparency
- **WHEN** cards render over the animated background
- **THEN** cards use `backdrop-blur` and a white/10 or similar low-opacity background, not a solid dark fill
