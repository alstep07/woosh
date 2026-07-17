## Why

`openspec/specs/` has no `user-auth` capability, so the canonical spec baseline does not
reflect the signup/wallet/session flow that has been live since V1 and evolved through
V1.5 (slug claim). This reverse-syncs the spec to the current implementation so future
changes (V3.2+) have an accurate baseline to diff against.

## What Changes

- **Add** `user-auth` spec describing the actual UCW email-OTP signup flow, device-id
  gating, the `/api/wallet/request-otp` → `/api/wallet/initialize` → `/api/wallet/complete`
  sequence, session/token storage split (`woosh_session` vs cached vs pending tokens),
  and the optional (not forced) slug claim CTA
- No code changes, spec sync only

## Capabilities

### New Capabilities
- `user-auth`: Passwordless email-OTP signup via Circle UCW, wallet initialization,
  session/token storage, and the optional post-signup slug claim

### Modified Capabilities
<!-- none -->

## Impact

- No code changes
- Affects: `openspec/specs/user-auth/spec.md` (new)
- Source of truth used: `src/features/auth/`, `src/views/signup/`, `src/views/slug-setup/`,
  `app/api/wallet/{request-otp,initialize,complete}`, `src/shared/lib/{circle,session}.ts`
