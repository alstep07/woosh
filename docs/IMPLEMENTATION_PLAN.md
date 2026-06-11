# Woosh — Implementation Plan (Stabilization + 80/20 Features)

> Written June 2026 after a full codebase review. Self-contained: each task lists the
> root cause, exact files, and acceptance criteria so it can be executed by any model
> or developer without prior session context. Execute phases in order — Phase 0 fixes
> real user-facing bugs and must land before any new feature.

## Context snapshot (updated 2026-06-11)

- **Phase 0** ✅ shipped on `phase/1-improvements` — stale closure fix, SDK singleton,
  central session module, 401 mapping, amount precision, P0.6 small fixes.
- **Phase 1** ✅ shipped on `phase/1-improvements` — `temp/improvements` merged with
  fixes: rate limiter (wallet+IP key), useSlugMap, optimistic pending tx, post-signup
  slug prompt, ChatPanel confirmation polish, SlugSetupPage 401 fallback.
- App is now **v2.1**. Branch `phase/1-improvements` ready to merge to `main`.
- **Phase 2** is next — Supabase metadata layer is the substrate for everything else.

---

## ✅ Phase 0 — Stabilization (shipped)

### P0.1 Fix stale-closure payment details in PaymentForm
**File:** `src/widgets/PaymentForm/ui/PaymentForm.tsx`
- `lockedAmount` state snaps on `enterWooshMode()`; input disabled while locked.
- `handleWooshPayRef` updated every render — SDK handler delegates to ref.

### P0.2 Single shared Circle SDK instance
**File:** `src/shared/lib/w3s.ts`
- Module-level singleton + `setLoginHandler` for per-page registration.
- `fetchDeviceId(appId)` helper exported with 10s timeout.

### P0.3 Central session module + complete logout cleanup
**File:** `src/shared/lib/session.ts`
- `getSession / setSession / clearAll` + typed token helpers.
- `clearAll()` removes every `woosh_*` key from both stores.

### P0.4 Map Circle token expiry to 401
**File:** `app/api/wallet/send-payment/route.ts`
- `isAuthError()` checks Circle error codes; returns 401 instead of 500.

### P0.5 Amount precision
**File:** `src/shared/lib/circle.ts`
- `amounts: [amount]` — validated string passed directly, no float round-trip.

### P0.6 Small fixes
- `fetchDeviceId` moved to `src/shared/lib/w3s.ts`, shared by `useAuth` + `PaymentForm`.
- ChatPanel welcome message rebuilt on load, not persisted to sessionStorage.
- Explorer link labeled "View account on explorer".

---

## ✅ Phase 1 — Land `temp/improvements` (shipped)

1. **In-memory rate limiting** on `/api/chat` (10 req/min); key = `walletAddress:ip`.
2. **`useSlugMap`** hook resolves address list → slug map; `TransactionList` shows `@slug`.
3. **Optimistic pending tx** entry in `TransactionList` after chat send (2.5s refetch).
4. **Post-signup slug prompt** — "Your wallet is ready → Claim @name / Skip".
5. **ChatPanel polish** — fee hint, first-time-recipient warning, animated check on paid.
6. **SlugSetupPage fix** — falls back to session token if pending absent; 401 clears
   tokens and drops into OTP flow.

---

## Phase 2 — 80/20 features (ordered by value-per-effort)

### 2.1 Supabase metadata layer (Low effort / High value — substrate for everything)
Tables: `chat_messages(user_address, role, text, created_at)`,
`tx_metadata(tx_hash pk, memo, sender_label)`,
`payment_requests(id pk, creator_address, amount text, memo, expires_at, status)`.
Server-side access only (service role key in API routes, never client). Unblocks 2.2
and chat persistence. Keep on-chain as source of truth for balances/txs.

### 2.2 Payment requests, off-chain first (Low / High)
- `POST /api/requests` creates a row → share `/r/[id]`.
- `/r/[id]` resolves the request server-side, renders PayPage with amount locked and memo shown.
- Paid detection: poll Blockscout for a transfer ≥ amount to creator after `created_at`.
- Chat tool: `create_payment_request(amount, memo)` → returns the link in chat.
- **No contract.** ERC-8183 or custom contract only when agents need trustless verification.

### 2.3 Woosh MCP server (Low-Medium / Very High — cheapest credible agentic story)
Repackage the four existing chat tools (`get_balance`, `get_transaction_history`,
`resolve_slug`, `send_payment`) as an MCP server (`@modelcontextprotocol/sdk`, stdio or
HTTP). `send_payment` returns a confirmation URL (`/pay/slug?amount=`) rather than
executing — human stays in the loop until DCW wallets exist. The demo: any Claude agent
pays a Woosh link with one config line.

### 2.4 Gateway/CCTP on PayPage (Low-Medium / Very High — biggest funnel fix)
Most senders hold USDC on Base/Ethereum, not Arc. Add Circle App Kit
(`@circle-fin/app-kit`) on `/pay/[slug]` for the external-wallet path only, so a sender
with Base USDC pays an Arc link without knowing a bridge exists. Woosh-account senders
stay Arc-native. Note: swap/bridge kits run server-side — route through an API handler.

### Deferred (do not start before 2.1–2.4 are live)
DCW agent wallets + `POST /api/pay` + spend policies; subscriptions
(`WooshSubscription`); ERC-8183 escrow UI; ZK proofs; Transak on-ramp; HIFI off-ramp;
EURC; ArcaneVM. Rationale: each is real effort and none fixes today's funnel or trust
issues. The MCP server (2.3) delivers the agentic positioning at a fraction of the cost
of the DCW stack.

---

## Verification checklist (run after each phase)

```
npm run lint && npx tsc --noEmit && npm run build
```
Manual smoke: signup (new email) → wallet → claim slug → copy link → pay link from
second browser (external wallet + Woosh mode) → chat "send $1 to <slug>" → confirm →
history shows tx → logout → storage is clean → login again → no stale UI anywhere.
