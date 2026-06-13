# Design — Woosh

## Visual Style

Minimal fintech — Stripe meets Linear.

| Token | Value |
|-------|-------|
| Background | `#0A0F1E` (deep navy) |
| Primary accent | `#0EA5E9` (electric blue) |
| Secondary accent | `#06B6D4` (cyan) |
| Text primary | `#F1F5F9` |
| Text secondary | `#64748B` |
| Card bg | `#111827` |
| Card border | `1px #1E293B` |
| Border radius | 12px cards, 8px inputs |
| Font | Inter |

- No gradients on UI elements
- Subtle blue glow on primary CTA only
- Mobile-first, lots of whitespace
- Custom scrollbar: 3px wide, blue-primary/25, rounded (`app/globals.css`)

---

## UX Principles

- Zero crypto jargon visible to end user
- No MetaMask prompts, no seed phrases, no network switching
- All amounts shown in USD — USDC under the hood
- Instant tx confirmation feedback
- Onboarding guide always accessible, never blocking
- PIN entry via Circle's secure iframe — never in Woosh UI directly
- Amount inputs: string only, never float arithmetic
