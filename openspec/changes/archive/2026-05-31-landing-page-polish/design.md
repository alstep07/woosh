## Context

`app/page.tsx` is a client component that checks `localStorage` for `woosh_session` on mount. The hero section currently wraps the dot animation in `position: absolute / overflow-hidden`, clipping it to that section only. The "How it works" cards use plain `bg-card border border-border` styling. Em-dashes appear in the hero headline. Logged-in users who click the CTA are routed to `/signup`, which shows a redundant "already signed in" screen.

## Goals / Non-Goals

**Goals:**
- Fullscreen fixed-position animation layer behind all content
- CTA routes logged-in users directly to `/dashboard`
- "How it works" covers three personas: humans paying from a wallet, humans using Woosh embedded wallet, and AI agents calling the API
- Glassmorphism card style for "How it works" items
- No em-dashes in visible copy

**Non-Goals:**
- Changes to any page other than `app/page.tsx` and `app/globals.css`
- New animation library or external dependency
- Changing the signup or dashboard pages

## Decisions

### 1. Full-screen animation layer

Move the dot grid out of the hero `<section>` and into a `position: fixed; inset: 0; z-index: 0; pointer-events: none` layer rendered directly inside `<main>`. All page content sits above it via `position: relative; z-index: 1`. This gives a continuous animated background across all scroll positions.

### 2. CTA routing for logged-in users

`hasSession` is already in state. Add a conditional: `href={hasSession ? "/dashboard" : "/signup"}` on the CTA. The nav "Go to dashboard" link stays for discoverability.

### 3. "How it works" — three columns, glassmorphism cards

Replace the two-column grid with three equal columns (stacked on mobile):
- **Human — receive**: sign up → get link → share
- **Human — send**: open link → enter amount → pay from wallet or Woosh account
- **AI agent — send**: GET /api/pay → POST with amount + auth → done (no UI needed)

Card style: `bg-white/5 backdrop-blur-sm border border-white/10 rounded-card` — semi-transparent glass against the dark animated background.

### 4. Em-dash removal

Replace `—` in hero subtitle copy with a period or line break. Keep copy concise.

## Risks / Trade-offs

- **Fixed animation layer + scroll**: `position: fixed` keeps dots stationary while user scrolls, which looks intentional (parallax-like). Acceptable.
- **`backdrop-blur` support**: Widely supported (>95% browsers). Graceful degradation: without blur, cards just look slightly transparent.
- **Three-column on mobile**: Stack vertically — no layout risk.
