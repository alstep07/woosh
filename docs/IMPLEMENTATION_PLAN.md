# Woosh — Implementation Plan

> Updated 2026-06-13 after full codebase review. Self-contained: each task lists what
> to build, **which tool/SDK to use**, why it's ordered where it is, and acceptance
> criteria. Execute roughly top-to-bottom; two tracks can run in parallel (noted).

---

## Context snapshot

- Phase 0 ✅ + Phase 1 ✅ shipped on `phase/1-improvements`. App is **v2.1**.
- Codebase is clean FSD: `challenge/execute` is generalized, on-chain is source of truth.
  New use cases rarely touch core.
- **Three facts driving order:**
  1. No off-chain layer; email/slug live in localStorage → account is NOT portable
     across browsers/devices (a retention bug, not a feature).
  2. `send_payment` already returns `pendingAction` (doesn't execute); the 4 chat tools
     are already pure functions → MCP is nearly free.
  3. `challenge/execute` already generalized (`slug/register` mirrors payment) →
     new contract calls (swap, gift cards, recurring) are structurally cheap.

---

## Architecture constraints (apply to EVERY new feature)

These keep the "improve later, don't rewrite" property. Non-negotiable.

- **On-chain stores the minimum**: funds + indisputable facts (claimed/not, owner, amount).
  Everything human-meaningful (labels, messages, design, status text) lives off-chain.
- **Claim/verification logic goes through a replaceable verifier** (interface or separate
  address), NEVER hardcoded into the fund-holding contract. New condition = new verifier,
  not a new vault + migration.
- **Reuse `challenge/execute`**: any new contract interaction = a server route that creates
  the challenge (like `/api/slug/register`) + client executes via the existing PIN iframe.
  Do NOT invent a new signing path.
- **On-chain stays source of truth** for balances/txs. Supabase is enrichment + identity only.
- **Never expose service-role keys / API secrets to the client.**
- **Every feature gets agent integration.** Every new capability must have a corresponding
  chat tool (or at minimum, the agent must know the feature exists and can guide the user
  to it). The agent is a first-class interface — not an afterthought. Minimum bar: agent
  answers "can I do X?" correctly. Target bar: agent can initiate X via a `pendingAction`
  confirmation card. New feature = new tool or updated system prompt, shipped together.

---

## TRACK A — Persistence & core (substrate)

### A1. Supabase persistence + account portability
**Tool:** `@supabase/supabase-js` (service-role key, server-side only in API routes).
**Why:** unblocks invoices, gift-card metadata, analytics; fixes the localStorage
portability bug (account currently tied to one browser).
**Tables:**
- `users(wallet_address pk, email, slug, created_at)` — portable identity
- `tx_metadata(tx_hash pk, memo, sender_label, created_at)`
- `payment_requests(id pk, creator_address, amount text, memo, expires_at, status, created_at)`
- `gift_cards(id pk, creator_address, amount text, token, status, claimed_by, message, created_at)`
- `chat_messages(id pk, user_address, role, text, created_at)` — optional, replaces sessionStorage
**Do:** migrate email↔wallet↔slug from localStorage → `users`; localStorage becomes cache.
**Acceptance:** log in from a second browser with same email → wallet + slug resolve.

---

## TRACK B — MCP (independent, no Supabase dep, runs parallel to A)

### B1. Woosh MCP server
**Tool:** `@modelcontextprotocol/sdk` (stdio or HTTP transport).
**Why:** cheapest credible agentic story. The 4 chat tools already exist as pure functions.
**Do:** repackage `get_balance`, `get_transaction_history`, `resolve_slug`, `send_payment`
as MCP tools. `send_payment` returns a confirmation URL (`/pay/slug?amount=`) — does NOT
execute, human stays in the loop (matches current `pendingAction` behavior exactly).
**Acceptance:** any Claude agent pays a Woosh link with one config line. New transport
layer over existing logic — no new business logic.

---

## NEAREST FEATURES (on-chain, no approvals beyond a free kit key, mostly no Supabase)

### 1. Multi-token balances in wallet (EURC, cirBTC)
**Tool:** `viem` `readContract` with ERC-20 `balanceOf` (same pattern as your slug reads).
**Why:** USDC is native (read via `getBalance`), but EURC/cirBTC are ERC-20 tokens with
contract addresses — must read via `balanceOf`. No Supabase, pure on-chain read.
**Addresses (Arc Testnet):** EURC `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`;
cirBTC — confirm current address from Arc docs/faucet before wiring.
**Do:** new hook `useTokenBalance(tokenAddress, account)` mirroring `useUSDCBalance`;
show EURC + cirBTC balances in `BalanceCard`.
**Acceptance:** wallet shows USDC, EURC, cirBTC balances, all read live from chain.

### 2. Swap USDC ⇄ EURC ⇄ cirBTC (external-wallet path first)
**Tool:** Circle **App Kit** `kit.swap()` (`@circle-fin/app-kit`). Needs a **free kit key**
from Circle Console (NOT an allowlist — just a console key).
**Why:** App Kit wraps the swap — no own contract, no liquidity sourcing. Arc Testnet is
the only testnet supporting swap, limited to USDC/EURC/cirBTC.
**Do:** on `/pay/[slug]` external-wallet path, wire `kit.swap({ from: { adapter: viemAdapter,
chain: "Arc_Testnet" }, tokenIn, tokenOut, amountIn, config: { kitKey } })`. viem adapter
exists for external wallets → works as documented.
**Acceptance:** external-wallet user swaps 1 USDC → EURC and sees updated balances.

### 3. Swap via chat agent
**Tool:** extend the existing chat tools in `app/api/chat/route.ts`.
**Do:** add tool `swap(tokenIn, tokenOut, amount)` returning `pendingAction` (exact same
pattern as `send_payment`). Client executes the swap on confirm.
**Acceptance:** "swap 50 USDC to EURC" in chat → confirmation card → executed.

### 4. Swap via Woosh embedded wallet (UCW path)

**Tool:** StableFX API (`/v1/exchange/stablefx/*`) + `signUserTypedData` from
`@circle-fin/user-controlled-wallets` (already installed).

**Why this works — investigated 2026-06-13:**
- App Kit's Circle Wallets adapter requires `entitySecret` (DCW only) — not usable.
- FxEscrow is a taker/maker OTC escrow, not an AMM. Circle's relayer matches trades.
  Direct contract call is impossible — you need the StableFX API as the relayer.
- BUT: StableFX taker flow is entirely EIP-712 signatures (no on-chain tx for Permit2).
  UCW has `signUserTypedData(userToken, { walletId, data: eip712String })` → `{ challengeId }`.
  Two signatures = two PIN entries. User already confirmed this UX is acceptable.

**Token support:** StableFX supports **USDC ↔ EURC only**. cirBTC is NOT supported via
StableFX. cirBTC swap + recurring purchases require DCW (see Deferred section).

**Flow:**
```
1. POST /stablefx/quotes → typedData (EIP-712)
2. signUserTypedData(userToken, typedData) → challengeId
3. sdk.execute(challengeId) → PIN #1 → quote signature
4. POST /stablefx/trades (quoteId + signature) → tradeId
5. POST /stablefx/signatures/funding/presign → fundingTypedData
6. signUserTypedData(userToken, fundingTypedData) → challengeId
7. sdk.execute(challengeId) → PIN #2 → funding signature
8. POST /stablefx/fund → done
```

**New API route:** `POST /api/wallet/swap` — orchestrates steps 1, 4, 5, 8 server-side.
Client executes the two `challengeId` values sequentially (same pattern as send-payment).

**Acceptance:** Woosh-account user swaps USDC ↔ EURC from chat or dashboard, two PIN entries.

---

## CLAIM / SHARE FEATURES (one layered contract + Supabase metadata)

> All verifiable on-chain or needing no verification. No oracles, no social conditions.
> Build the contract per the layered architecture: vault holds funds + status; verifier
> is replaceable; metadata in Supabase.

### 5. Gift cards (claim-by-secret) — viral acquisition
**Tool:** custom Solidity contract (vault + `claim(cardId, proof)` where proof = secret
preimage) deployed via your existing `challenge/execute` route pattern; metadata in
Supabase `gift_cards`; bridge/balance reads via `viem`.
**Why:** viral by nature (recipient gets money → sees Woosh → claims → now has an account).
Cheaper AND more growth-driving than recurring.
**Flow:** creator funds card + stores `keccak256(secret)` → shares link with secret →
recipient proves knowledge → contract releases funds.
**Acceptance:** create a $5 card, open claim link in a second browser, funds land.

### 6. Split-claim links
**Tool:** same vault contract extended with `claimsRemaining` counter + 1-per-address guard.
**Why:** "first N people get a share each." Reuses the gift-card contract.
**Honest limit:** 1-per-address stops accidental double-claim, NOT deliberate multi-wallet
sybil. Fine for community use; do NOT position as a protected public raffle.
**Acceptance:** $100 / 5 claims → first 5 distinct addresses get $20 each, 6th is rejected.

### 7. Tip jar / open-amount links
**Tool:** variant of existing payment links — no fixed amount. Mostly UI + Supabase label.
**Do:** `woosh/tip/slug` accepts any amount from any sender.
**Acceptance:** open tip link, send arbitrary amount, creator's balance updates.

### 8. QR for payment requests
**Tool:** any QR lib (e.g. `qrcode`) over the payment-request URL from A1/2.x.
**Do:** render a QR for `/r/[id]` so it's scannable in person.
**Acceptance:** scanning the QR opens the locked-amount pay page.

### (also in this tier) Payment requests / invoices
**Tool:** Supabase `payment_requests` + reuse existing `/api/transactions/[address]`
Blockscout polling for paid-detection. Chat tool `create_payment_request(amount, memo)`.
**Why:** this is the real acquisition channel — every request sent surfaces Woosh to a new person.
**Acceptance:** create request → share `/r/[id]` → pay from another wallet → status flips to paid.

---

## RETENTION / DATA (cheap, reuse existing sources)

### 9. Chat spending analytics
**Tool:** new chat tool `analyze_activity` aggregating the SAME Blockscout history already
used by `get_transaction_history`. No new data source, no Supabase.
**Do:** answer "how much did I receive this month", "top senders".
**Acceptance:** chat returns correct monthly totals computed from on-chain history.

---

## FUNNEL FIX (same SDK as swap)

### 10. Bridge / Unified Balance on PayPage
**Tool:** Circle **App Kit** Bridge + Unified Balance (wraps CCTP) — same SDK as swap.
**Why:** most senders hold USDC on Base/Ethereum, not Arc. Unified Balance lets them pay
an Arc link without knowing a bridge exists. Do this together with swap (one integration).
**Acceptance:** a sender with Base USDC pays an Arc `/pay/[slug]` link successfully.

---

## DEFERRED (real effort or external dependency — not now)

### USYC yield — BLOCKED on external allowlist (start approval NOW, code later)
**Tool:** USYC contract on Arc Testnet; `previewRedeem()` for live price (KudiArc pattern,
no hardcoded APY); deposit/redeem via your `challenge/execute` route pattern.
**Blocker:** Circle USYC allowlist approval (KudiArc waited, approved Mar 2026).
**Action:** submit allowlist application immediately, in parallel. Do NOT put on critical path.

### DCW + cirBTC swap + Recurring — one mechanism unlocks all three
**Tool / reference pattern:** DCW (`entitySecret` server-side) + StableFX API (swap) +
scheduled executor (cron/agent loop) + spend policies.
**Why deferred:** UCW requires PIN per tx; autonomous execution needs DCW. Build DCW
infra ONCE → it unlocks: cirBTC swap (UCW can't reach cirBTC via StableFX), recurring
payments, DCA strategies. Until then these are one project, not per-asset features.
**Agent flow (chat-driven):** user asks agent to set up DCA → agent creates DCW
server-side via new tool `setup_dca(tokenIn, tokenOut, amountPerDay, days)` → returns
`pendingAction` to fund the strategy wallet → user confirms + transfers USDC (one PIN)
→ server executes swaps autonomously on schedule. Same pattern for recurring payments.
**Note on narrative:** lead with USDC↔EURC recurring (FX payments, salaries, SaaS).
Keep "recurring buy cirBTC" low-key — Arc is stablecoin finance, not speculation.

### Also deferred (opportunistic, after human-side traction)
- **Fiat off-ramp** — Ramp (cheap EU/SEPA) or Transak (virtual-IBAN, agent flows).
  White-label removes licensing burden (provider holds the license). Sandbox-testable
  before any contract. Still needs a provider account + onboarding.
- **DCW agent wallets + `POST /api/pay` + spend policies** — full autonomous agent payments
  (no human in loop). Separate stack.
- **402 / nanopayments** — machine-to-machine API billing. Different paradigm from Woosh's
  transfer model; only if entering that market deliberately.
- ERC-8183 escrow UI, EURC as a first-class display currency, ZK proofs — opportunistic.

---

## Suggested execution order (by value-per-effort)

```
Parallel start:
  TRACK A: A1 Supabase + portability
  TRACK B: B1 MCP server (independent)

Then, nearest on-chain wins:
  1. Multi-token balances (EURC, cirBTC)      viem readContract
  2. Swap external-wallet                      App Kit kit.swap (free kit key)
  3. Swap via chat agent                       extend chat tools, pendingAction
  4. Swap via UCW                              StableFX API + signUserTypedData (2 PINs)

Then claim/share (needs A1):
  Payment requests/invoices                    Supabase + Blockscout polling
  5. Gift cards (claim-by-secret)              layered contract + Supabase
  6. Split-claim                               extend same contract
  7. Tip jar / open-amount                     payment-link variant
  8. QR                                        qrcode over /r/[id]

Cheap retention:
  9. Chat spending analytics                   aggregate existing Blockscout data

Funnel fix (same SDK as swap):
  10. Bridge / Unified Balance                 App Kit (wraps CCTP)

Deferred: USYC (allowlist), Recurring (permit+executor), off-ramp, DCW, 402.
```

---

## Verification checklist (run after each task)

```
npm run lint && npx tsc --noEmit && npm run build
```
Manual smoke: signup (new email) → wallet → claim slug → copy link → pay from a second
browser (external wallet + Woosh mode) → chat "send $1 to <slug>" → confirm → history shows
tx → logout → storage clean → login again from a different browser → account + slug persist.
