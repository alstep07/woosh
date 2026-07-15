## Why

`openspec/specs/` has no `slug-payment-links` capability. This reverse-syncs the spec to
the current onchain slug registry, `/pay/[slug]` resolution, and send-payment flow
shipped in V1/V1.5.

## What Changes

- **Add** `slug-payment-links` spec covering: slug format/uniqueness rules enforced
  onchain, the register/registerFor/isAvailable contract surface, slug resolution on
  `/pay/[slug]` (address pass-through, onchain lookup, invalid-link fallback), invoice
  links overriding slug-derived recipient info, and the two payment execution paths
  (Circle challenge/execute for Woosh wallets vs. raw value transfer for external wallets)
- No code changes, spec sync only

## Capabilities

### New Capabilities
- `slug-payment-links`: WooshSlugRegistry-backed username claim and `/pay/[slug]`
  payment link resolution and execution

### Modified Capabilities
<!-- none -->

## Impact

- No code changes
- Affects: `openspec/specs/slug-payment-links/spec.md` (new)
- Source of truth used: `contracts/src/WooshSlugRegistry.sol`, `src/entities/slug/`,
  `app/pay/[slug]/`, `src/views/pay/`, `src/widgets/PaymentForm/`,
  `app/api/wallet/send-payment`, `app/api/slug/register`
