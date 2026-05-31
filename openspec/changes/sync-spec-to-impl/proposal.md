## Why

The build-v1 spec was written before implementation. During development, the Circle wallet strategy shifted from Developer-Controlled Wallets (custodial) to User-Controlled Wallets with email OTP (non-custodial), changing the signup flow significantly. Specs and design doc must reflect what was actually built to remain useful for V2 planning and onboarding.

## What Changes

- **Update** `user-auth` spec — signup is now a 3-step OTP flow, not a single email submit; no duplicate-email error (OTP handles re-auth); wallet creation requires Circle SDK challenge execution client-side
- **Update** `design.md` — architectural decisions changed: UCW instead of DCW, multi-step signup, native USDC balance reads (not ERC20 event logs), in-memory store (not Circle metadata), actual API route structure
- **Update** `tasks.md` in build-v1 — mark tasks accurately, correct implementation details in Circle SDK tasks (task 2.2 references `createEmbeddedWallet` which was never the final API)
- No code changes — spec sync only

## Capabilities

### New Capabilities
<!-- none — no new product capabilities introduced -->

### Modified Capabilities
- `user-auth`: Signup flow changed from single-step DCW wallet creation to 3-step UCW email OTP flow (request OTP → verify in Circle modal → execute wallet challenge). Non-custodial: users hold their own keys. API routes restructured from `/api/signup` to `/api/wallet/request-otp`, `/api/wallet/initialize`, `/api/wallet/complete`.

## Impact

- No code changes
- Affects: `openspec/changes/build-v1/design.md`, `openspec/changes/build-v1/specs/user-auth/spec.md`, `openspec/changes/build-v1/tasks.md`
- Downstream: V2 planning depends on accurate V1 spec
