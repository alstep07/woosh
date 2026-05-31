## Context

All pages repeat an inline nav with the plain "woosh" text — no shared header component exists. The logo file (`public/woosh_logo.png`) is already present but unused. The app stays dark-only for now.

## Goals / Non-Goals

**Goals:**
- Single shared `BrandHeader` component used on all pages
- `woosh_logo.png` displayed beside the wordmark; both link to `/`
- Animated hero background on landing page — pure CSS/Tailwind, zero new npm deps
- "Sign in" shortcut for returning users (checks localStorage for existing `woosh_session`)

**Non-Goals:**
- Light mode or theme toggling (deferred)
- Real authentication server-side (session is still localStorage-only in V1)
- Complex animation library (Framer Motion, GSAP, etc.)

## Decisions

### 1. BrandHeader component

A single `components/BrandHeader.tsx` client component that renders:
- Left: `<Image src="/woosh_logo.png" />` + "woosh" wordmark, wrapped in `<Link href="/">`
- Right: contextual slot (passed as `rightSlot` prop)

Pages pass their current right-side content (Sign up link, email display, etc.) via the `rightSlot` prop. This keeps the header flexible without needing a context.

### 2. Landing page animation — CSS keyframe grid

A `position: absolute` layer behind the hero section renders a grid of subtle dots that pulse/fade using a CSS `@keyframes` animation staggered via `animation-delay`. No JS, no canvas, no library. The grid is clipped to the hero section via `overflow-hidden`.

Alternative considered: SVG particle JS canvas — rejected for complexity and bundle size.

### 3. Returning-user sign-in

On mount, landing and signup pages check `localStorage.getItem("woosh_session")`. If present, they render a "Go to dashboard →" link instead of (or in addition to) the signup CTA. No server round-trip needed — the session is already local.

## Risks / Trade-offs

- **Logo size**: If `woosh_logo.png` is very large, it will affect LCP. Mitigation: use `next/image` with fixed `width`/`height` and `priority`.
- **Animation performance**: Animating many DOM nodes can be janky on low-end devices. Mitigation: use `will-change: opacity` and keep the grid small (≤ 60 dots); add `prefers-reduced-motion` media query to disable.
