## Why

`openspec/specs/` has no `invoices` capability. Payment requests/invoices (V2.2) shipped
fully onchain via `WooshInvoiceRegistry`, not the originally-planned DB-backed design;
the spec needs to reflect what was actually built.

## What Changes

- **Add** `invoices` spec covering: deterministic tamper-proof invoice ids
  (`keccak256(creator, salt)`), the create/pay onchain contract surface, the
  challenge/execute + 401/OTP-fallback API pattern, `/i/[id]` paid/unpaid rendering, the
  onchain-read "My invoices" dashboard, and chat tool support
- No code changes, spec sync only

## Capabilities

### New Capabilities
- `invoices`: onchain payment requests via `WooshInvoiceRegistry`, shareable `/i/[id]`
  links, and dashboard/chat integration

### Modified Capabilities
<!-- none -->

## Impact

- No code changes
- Affects: `openspec/specs/invoices/spec.md` (new)
- Source of truth used: `contracts/src/WooshInvoiceRegistry.sol`, `src/entities/invoice/`,
  `app/i/[id]/`, `app/dashboard/invoices/`, `app/api/wallet/{create-invoice,pay-invoice}`,
  `src/widgets/CreateInvoiceModal/`
