## ADDED Requirements

### Requirement: Environment-aware payment link
The dashboard SHALL construct the payment link using `NEXT_PUBLIC_BASE_URL` env var so the displayed and copied URL is correct in local dev, staging, and production.

#### Scenario: Local dev payment link
- **WHEN** `NEXT_PUBLIC_BASE_URL` is `http://localhost:3000`
- **THEN** the payment link shown and copied is `http://localhost:3000/pay/<slug>`

#### Scenario: Production payment link
- **WHEN** `NEXT_PUBLIC_BASE_URL` is `https://woosh.app`
- **THEN** the payment link shown and copied is `https://woosh.app/pay/<slug>`

### Requirement: Dashboard logout
The dashboard SHALL provide a logout action that clears the user session and returns to the landing page.

#### Scenario: Logout clears session
- **WHEN** the user clicks "Log out" in the dashboard header
- **THEN** `woosh_session` is removed from localStorage and the user is redirected to `/`

### Requirement: Transaction explorer links
Each transaction in the dashboard history SHALL link to the Arc block explorer so users can verify the transaction on-chain.

#### Scenario: Clicking a transaction opens explorer
- **WHEN** the user clicks on a transaction row
- **THEN** the Arc block explorer opens in a new tab at the transaction's detail page
