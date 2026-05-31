## ADDED Requirements

### Requirement: Hero section communicates value prop
The landing page at `/` SHALL display a hero section with a headline, subheadline, and a primary CTA that drives recipients to sign up.

#### Scenario: Visitor lands on homepage
- **WHEN** a user navigates to `/`
- **THEN** the page SHALL render a headline, a one-sentence subheadline explaining the product, and a "Get your payment link" CTA button linking to `/signup`

### Requirement: How it works section
The landing page SHALL include a concise "How it works" section with steps for both the recipient and sender personas.

#### Scenario: Recipient reads the flow
- **WHEN** a visitor scrolls to the how-it-works section
- **THEN** the section SHALL display at minimum 3 recipient steps: sign up with email, get your payment link, share it with clients

#### Scenario: Sender reads the flow
- **WHEN** a visitor scrolls to the how-it-works section
- **THEN** the section SHALL display at minimum 2 sender steps: open the payment link, pay USDC from your wallet

### Requirement: No crypto jargon visible on landing page
The landing page SHALL avoid technical blockchain terminology in all visible copy.

#### Scenario: Landing page copy audit
- **WHEN** the landing page is rendered
- **THEN** no visible text SHALL contain the words "blockchain", "Ethereum", "gas", "seed phrase", or "smart contract"

### Requirement: Mobile-first responsive layout
The landing page SHALL be fully usable on mobile viewports (375px and up).

#### Scenario: Mobile viewport render
- **WHEN** the page is viewed at 375px width
- **THEN** all sections SHALL stack vertically with no horizontal overflow and all CTAs SHALL be tappable (min 44px touch target)
