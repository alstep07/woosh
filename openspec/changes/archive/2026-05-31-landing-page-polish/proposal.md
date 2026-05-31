## Why

The landing page has several UX and visual rough edges: em-dash punctuation feels heavy, the "How it works" section only describes human freelancers and ignores the agentic use case, the background animation is clipped to the hero instead of filling the screen, logged-in users hit a redundant redirect before reaching their dashboard, and the feature cards look plain. This change polishes all five areas in one pass.

## What Changes

- **Fix**: Remove em-dash (`—`) characters from hero copy and replace with simpler punctuation or rewording
- **Fix**: "Get your payment link" CTA navigates logged-in users directly to `/dashboard` instead of `/signup → already signed in screen → dashboard`
- **Update**: "How it works" copy and layout rewritten to cover both human and agentic senders; section gets half-transparent glassmorphism card styling
- **Update**: Background dot animation moved to a fixed full-screen layer so it fills the viewport on all sections, not just the hero
- **Modified**: Landing page (`app/page.tsx`) — all of the above

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `landing-page`: Copy, CTA routing, animation scope, and "How it works" UI updated

## Impact

- `app/page.tsx` — all changes confined to this file
- `app/globals.css` — animation layer moved to `position: fixed` full-screen
- No new dependencies
