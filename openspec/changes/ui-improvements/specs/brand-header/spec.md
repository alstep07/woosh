## ADDED Requirements

### Requirement: Logo and wordmark link to home
The `BrandHeader` component SHALL render `woosh_logo.png` and the "woosh" wordmark side by side as a single clickable link to `/`.

#### Scenario: User clicks logo on any page
- **WHEN** user clicks the logo or wordmark in the nav
- **THEN** browser navigates to `/`

#### Scenario: Logo renders with correct dimensions
- **WHEN** any page with BrandHeader loads
- **THEN** logo image is displayed at a fixed height (32–40px) using `next/image` with `priority` on the landing page

### Requirement: BrandHeader used on all pages
All four pages (`/`, `/signup`, `/dashboard`, `/pay/[slug]`) SHALL use the shared `BrandHeader` component instead of inline nav markup.

#### Scenario: Consistent header across pages
- **WHEN** user navigates between any two pages
- **THEN** the logo, wordmark, and layout of the left side of the nav are identical

### Requirement: Contextual right slot
`BrandHeader` SHALL accept a `rightSlot` prop (React node) rendered on the right side of the nav, allowing each page to pass its own action (Sign up link, email display, theme toggle, etc.).

#### Scenario: Landing page shows Sign up link
- **WHEN** landing page renders
- **THEN** BrandHeader right side shows "Sign up" link to `/signup`

#### Scenario: Dashboard shows user email
- **WHEN** dashboard renders
- **THEN** BrandHeader right side shows the signed-in user's email address
