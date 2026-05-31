## Why

The current UI is minimal to the point of feeling empty, lacks brand identity, and has no path for returning users to log in. Adding the logo, interactive background, light/dark theming, and a login flow makes the product feel polished and complete.

## What Changes

- **New**: `public/woosh_logo.png` rendered in the nav on all pages; logo + app name are clickable links to `/`
- **New**: "Sign in" entry point on landing page and signup page for users who already have a `woosh_session`
- **New**: Animated particle/grid background on the landing page hero section
- **Modified**: Nav on `/`, `/signup`, `/dashboard`, and `/pay/[slug]` — unified brand header with logo

## Capabilities

### New Capabilities
- `brand-header`: Shared nav component with logo image + "woosh" wordmark (linked to `/`), and contextual right-side action (Sign up / Sign in / email)
- `landing-animation`: Subtle animated background for the hero section (floating particles or CSS grid pulse — no external animation library)
- `returning-user-signin`: "Already have an account? Sign in" link on landing and signup pages; detects existing `woosh_session` and redirects straight to dashboard

### Modified Capabilities
- `landing-page`: Add logo in nav, animated bg in hero, sign-in link; no copy changes
- `user-auth`: Add "already have an account" shortcut; no flow changes to the OTP process itself
- `dashboard`: Replace plain "woosh" text with logo component in header
- `payment-page`: Replace plain "woosh" text with logo component in header

## Impact

- New shared component: `components/BrandHeader.tsx`
- New shared component: `components/ThemeToggle.tsx`
- `app/layout.tsx`: switch Tailwind to `darkMode: 'class'`; wrap with theme provider or inline script
- `tailwind.config.ts`: `darkMode: 'class'`; add light-mode color tokens
- `app/globals.css`: add light-mode CSS variables
- No new dependencies required (animation via CSS/Tailwind; theme via class toggle)
