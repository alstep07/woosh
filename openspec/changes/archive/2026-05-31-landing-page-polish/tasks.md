## 1. Animation — Full-screen Layer

- [x] 1.1 In `app/globals.css`, add `.woosh-bg` class: `position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden`
- [x] 1.2 In `app/page.tsx`, move the dot grid `<div>` out of the hero `<section>` and render it as the first child of `<main>` using the `.woosh-bg` class
- [x] 1.3 Remove `overflow-hidden` and `relative` from the hero `<section>` (no longer needed to clip the dots)
- [x] 1.4 Add `relative z-10` to all page content sections (nav, hero, how-it-works, footer) so they render above the fixed layer

## 2. Copy — Remove Em-dashes and Update Hero

- [x] 2.1 Remove all `—` characters from hero headline and subheadline; reword if needed (e.g. use a period or comma instead)
- [x] 2.2 Update hero subheadline to remove "no bank account required" if it contains an em-dash; keep copy concise

## 3. CTA — Smart Routing for Logged-in Users

- [x] 3.1 In `app/page.tsx`, change the "Get your payment link" `<Link>` href to `hasSession ? "/dashboard" : "/signup"`
- [x] 3.2 Update the button label conditionally: logged-in users see "Go to your dashboard", logged-out see "Get your payment link"

## 4. How It Works — Three Personas + Glassmorphism

- [x] 4.1 Change grid from `grid-cols-1 md:grid-cols-2` to `grid-cols-1 md:grid-cols-3`
- [x] 4.2 Replace card `className` from solid `bg-card border border-border` to `bg-white/5 backdrop-blur-sm border border-white/10`
- [x] 4.3 Rewrite first card as "To receive" (unchanged steps: sign up, get link, share)
- [x] 4.4 Rewrite second card as "To pay" for human senders: open link, enter amount, pay from wallet or Woosh account
- [x] 4.5 Add third card "For AI agents": call the API with recipient and amount, payment executes, done — no UI required
- [x] 4.6 Update accent colors: "To receive" = blue-primary, "To pay" = blue-secondary, "For AI agents" = a purple/violet tone (e.g. `text-violet-400`, `bg-violet-400/10`)

## 5. QA

- [x] 5.1 Verify no `—` characters remain in any visible copy
- [x] 5.2 Verify animated dots are visible behind the "How it works" cards when scrolled
- [x] 5.3 Verify logged-in CTA goes to `/dashboard`, logged-out goes to `/signup`
- [x] 5.4 Verify three columns render correctly at both desktop and mobile widths
