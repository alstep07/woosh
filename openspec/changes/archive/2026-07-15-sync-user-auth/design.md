## Context

This is a spec-sync change: it documents what was actually built, not a new design.
Signup was originally speculated as Circle Developer-Controlled Wallets; the shipped
implementation uses User-Controlled Wallets (UCW) with email OTP so the platform never
custodies user keys, and PIN entry happens client-side via the Circle W3S SDK.

## Goals / Non-Goals

**Goals:** accurately document the current signup/session/slug-claim flow.
**Non-Goals:** any code changes; documenting future (V3.2+) auth work.

## Decisions

- Session data is split three ways in `src/shared/lib/session.ts`: `woosh_session`
  (localStorage, permanent profile), cached tokens (sessionStorage, reused to skip
  re-OTP on later actions), and pending tokens (sessionStorage, one-shot handoff from
  signup to slug-setup). All accessors are try/catch-wrapped for Safari private mode.
- Slug claim is a soft CTA shown after signup, not a forced step — matches the
  documented pattern in CLAUDE.md ("Claim a username" is voluntary from dashboard).
