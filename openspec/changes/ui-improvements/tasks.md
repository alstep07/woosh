## 1. BrandHeader Component

- [ ] 1.1 Create `components/BrandHeader.tsx` — client component accepting `rightSlot?: React.ReactNode` prop
- [ ] 1.2 Left side: `<Link href="/">` wrapping `<Image src="/woosh_logo.png" height={36} alt="Woosh" priority />` + "woosh" wordmark text
- [ ] 1.3 Right side: render `rightSlot`
- [ ] 1.4 Style nav: `flex items-center justify-between px-6 py-5 max-w-5xl mx-auto`

## 2. Replace Inline Navs with BrandHeader

- [ ] 2.1 Update `app/page.tsx` — replace inline `<nav>` with `<BrandHeader rightSlot={<Link href="/signup">Sign up</Link>} />`
- [ ] 2.2 Update `app/signup/page.tsx` — replace inline "woosh" link with `<BrandHeader />`
- [ ] 2.3 Update `app/dashboard/page.tsx` — replace inline header with `<BrandHeader rightSlot={<span>{session.email}</span>} />`
- [ ] 2.4 Update `app/pay/[slug]/PaymentForm.tsx` — remove the inline "woosh" wordmark from the form card (header is now handled by the page layout); wrap the pay page in a layout that includes `<BrandHeader />`

## 3. Returning User Sign-in Shortcut

- [ ] 3.1 In `app/page.tsx`, add a `useEffect` on mount that checks `localStorage.getItem('woosh_session')` — if present, show a "Go to dashboard →" link in the nav right slot
- [ ] 3.2 In `app/signup/page.tsx`, add a `useEffect` that checks for existing session — if present, render "You're already signed in" prompt with link to `/dashboard` instead of the email form

## 4. Landing Page Animation

- [ ] 4.1 Add a `@keyframes woosh-pulse` animation in `globals.css` that fades opacity 0.05 → 0.15 → 0.05
- [ ] 4.2 Add `@media (prefers-reduced-motion: reduce)` rule that sets `animation: none` on the animated layer
- [ ] 4.3 In `app/page.tsx` hero section, add an absolutely-positioned grid layer with ~60 small dot elements inside `overflow-hidden` container; apply staggered `animation-delay` via inline style
- [ ] 4.4 Ensure animation layer has `pointer-events-none` and opacity low enough that hero text remains legible

## 5. Polish & QA

- [ ] 5.1 Verify logo renders correctly on mobile (375px) — check size, spacing, no overflow
- [ ] 5.2 Verify "Go to dashboard" appears on landing when session exists and disappears when it doesn't
- [ ] 5.3 Verify animation is disabled when `prefers-reduced-motion` is active
