# Woosh, Implementation Plan

> Updated 2026-06-21 after shipping V3.0 strategies. Self-contained: each task lists what
> to build, **which tool/SDK to use**, why it's ordered where it is, and acceptance
> criteria. Execute roughly top-to-bottom; two tracks can run in parallel (noted).

---

## Context snapshot

- Phase 0 ✅ + Phase 1 ✅ + invoices ✅ + **V3.0 strategies ✅** shipped. App is **v3.0**.
- **Strategies SHIPPED (V3.0):** `WooshStrategyRegistry` onchain vault + DCW executor.
  Recurring USDC payments (trustless) and DCA auto-buys (EURC/cirBTC via Circle Swap Kit,
  `createCircleWalletsAdapter` so the DCW executor signs the swap, no raw key). UI at
  `/dashboard/strategies`, chat tools `create_strategy`/`get_strategies`, Vercel Cron
  executor (`/api/cron/execute-strategies`, scheduler-agnostic). This resolves the old
  "DCW + cirBTC swap + Recurring = one deferred project" item below.
- **Invoices shipped onchain, not stateless.** We built `WooshInvoiceRegistry` instead
  of the link-only `/pay/slug?amount=` approach this plan originally proposed. Reason:
  the contract stores amount/memo/payee so the share link (`/i/[id]`) carries only the
  id and can't be tampered with, and "my invoices" reads straight from the chain by
  creator. Still no DB, onchain stays source of truth. See the shipped section below.
- Codebase is clean FSD: `challenge/execute` is generalized, onchain is source of truth.
  New use cases rarely touch core.
- **Three facts driving order:**
  1. No off-chain layer, and we confirmed we don't need one. Circle resolves the
     wallet from email (`listWallets(userToken)`), slug is onchain; localStorage is
     just a cache, so the account is already portable. See ARCHITECTURE →
     "Where Data Lives, No Off-Chain Storage by Default".
  2. `send_payment` already returns `pendingAction` (doesn't execute); the 4 chat tools
     are already pure functions → MCP is nearly free.
  3. `challenge/execute` already generalized (`slug/register` mirrors payment) →
     new contract calls (swap, gift cards, recurring) are structurally cheap.

---

## Architecture constraints (apply to EVERY new feature)

These keep the "improve later, don't rewrite" property. Non-negotiable.

- **Onchain stores the minimum**: funds + indisputable facts (claimed/not, owner, amount).
  Everything human-meaningful (labels, messages, design, status text) lives off-chain.
- **Claim/verification logic goes through a replaceable verifier** (interface or separate
  address), NEVER hardcoded into the fund-holding contract. New condition = new verifier,
  not a new vault + migration.
- **Reuse `challenge/execute`**: any new contract interaction = a server route that creates
  the challenge (like `/api/slug/register`) + client executes via the existing PIN iframe.
  Do NOT invent a new signing path.
- **Onchain stays source of truth** for balances/txs. **No off-chain DB by default**.
  Every storage idea must pass the ARCHITECTURE → "Where Data Lives" gate first.
- **Never expose service-role keys / API secrets to the client.**
- **Every feature gets agent integration.** Every new capability must have a corresponding
  chat tool (or at minimum, the agent must know the feature exists and can guide the user
  to it). The agent is a first-class interface, not an afterthought. Minimum bar: agent
  answers "can I do X?" correctly. Target bar: agent can initiate X via a `pendingAction`
  confirmation card. New feature = new tool or updated system prompt, shipped together.

---

## TRACK A, Off-chain storage (⚠️ OPEN QUESTION, do we ever need it?)

> **Status: questioned / not scheduled.** We investigated adding Supabase (an A1
> "persistence + portability" task) and **pulled it**, most of what it would store
> already lives onchain or in Circle, and portability is already solved (Circle
> resolves wallet from email, slug is onchain). See ARCHITECTURE → "Where Data Lives".
>
> A datastore is reconsidered ONLY when a concrete feature hits a wall the
> chain/links/Blockscout can't solve. Candidate triggers to watch for:
> - ~~an invoice dashboard~~, RESOLVED onchain. `WooshInvoiceRegistry` stores the
>   request + paid status and `getInvoiceIds(creator)` lists them, so no Blockscout
>   amount-collision ambiguity and no DB. See the shipped invoices section below.
> - "you got paid" notifications needing a server to watch + store;
> - cross-user analytics;
> - genuinely homeless human text at scale (gift-card messages, tx memos).
>
> If/when one of these is real: add the SINGLE table that feature needs (not the
> speculative 5-table schema), server-side service-role key only, and never mirror
> onchain facts into it.

---

## TRACK B, MCP (independent, no DB, can run anytime)

### B1. Woosh MCP server
**Tool:** `@modelcontextprotocol/sdk` (stdio or HTTP transport).
**Why:** cheapest credible agentic story. The 4 chat tools already exist as pure functions.
**Do:** repackage `get_balance`, `get_transaction_history`, `resolve_slug`, `send_payment`
as MCP tools. `send_payment` returns a confirmation URL (`/pay/slug?amount=`), does NOT
execute, human stays in the loop (matches current `pendingAction` behavior exactly).
**Acceptance:** any Claude agent pays a Woosh link with one config line. New transport
layer over existing logic, no new business logic.

---

## NEAREST FEATURES (onchain, no approvals beyond a free kit key, no DB)

### 1. Multi-token balances in wallet (EURC, cirBTC)
**Tool:** `viem` `readContract` with ERC-20 `balanceOf` (same pattern as your slug reads).
**Why:** USDC is native (read via `getBalance`), but EURC/cirBTC are ERC-20 tokens with
contract addresses, must read via `balanceOf`. No Supabase, pure onchain read.
**Addresses (Arc Testnet):** EURC `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`;
cirBTC, confirm current address from Arc docs/faucet before wiring.
**Do:** new hook `useTokenBalance(tokenAddress, account)` mirroring `useUSDCBalance`;
show EURC + cirBTC balances in `BalanceCard`.
**Acceptance:** wallet shows USDC, EURC, cirBTC balances, all read live from chain.

### 2. Swap USDC ⇄ EURC ⇄ cirBTC (external-wallet path first)
**Tool:** Circle **App Kit** `kit.swap()` (`@circle-fin/app-kit`). Needs a **free kit key**
from Circle Console (NOT an allowlist, just a console key).
**Why:** App Kit wraps the swap, no own contract, no liquidity sourcing. Arc Testnet is
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

**Why this works, investigated 2026-06-13:**
- App Kit's Circle Wallets adapter requires `entitySecret` (DCW only), not usable.
- FxEscrow is a taker/maker OTC escrow, not an AMM. Circle's relayer matches trades.
  Direct contract call is impossible, you need the StableFX API as the relayer.
- BUT: StableFX taker flow is entirely EIP-712 signatures (no onchain tx for Permit2).
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

**New API route:** `POST /api/wallet/swap`, orchestrates steps 1, 4, 5, 8 server-side.
Client executes the two `challengeId` values sequentially (same pattern as send-payment).

**Acceptance:** Woosh-account user swaps USDC ↔ EURC from chat or dashboard, two PIN entries.

---

## CLAIM / SHARE FEATURES (one layered contract, onchain state)

> All verifiable onchain or needing no verification. No oracles, no social conditions.
> Build the contract per the layered architecture: vault holds funds + status; verifier
> is replaceable. State (amount, status, claimed_by) is onchain, do NOT shadow it in a
> DB. Only genuinely homeless human text (e.g. a gift-card message) would need off-chain
> storage, and only per the ARCHITECTURE "Where Data Lives" gate.

### 5. Gift cards (claim-by-secret), viral acquisition
**Tool:** custom Solidity contract (vault + `claim(cardId, proof)` where proof = secret
preimage) deployed via your existing `challenge/execute` route pattern; bridge/balance
reads via `viem`. Amount/status/claimed_by live in contract state. A card *message*, if
added, is the only off-chain candidate, defer until the feature actually wants it.
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
**Tool:** variant of existing payment links, no fixed amount. Pure UI, no storage.
**Do:** `woosh/tip/slug` accepts any amount from any sender.
**Acceptance:** open tip link, send arbitrary amount, creator's balance updates.

### 8. QR for payment requests
**Tool:** any QR lib (e.g. `qrcode`) over the payment-request URL.
**Do:** render a QR for `/pay/slug?amount=…` so it's scannable in person.
**Acceptance:** scanning the QR opens the locked-amount pay page.

### (also in this tier) Payment requests / invoices, ✅ SHIPPED (onchain)
**What we built (diverged from the original stateless plan, on purpose):**
`WooshInvoiceRegistry.sol` on Arc stores each request, `payee`, `amount`, `memo`,
`paid`, `payer`, `createdAt`, set by the creator and immutable. Deterministic id
`keccak256(abi.encode(creator, salt))` so ids can't be squatted.
- **Create:** `/api/wallet/create-invoice` → `createInvoiceCreateChallenge` → `sdk.execute()` (PIN).
- **Pay:** `/i/[id]` page reads the invoice from chain → `/api/wallet/pay-invoice` →
  `createInvoicePayChallenge` (`pay(id)` payable, exact `msg.value`, forwards to payee).
- **My invoices:** `/dashboard/invoices` (`RequestsPage`) reads `getInvoiceIds(creator)`
  straight from chain, no off-chain bookkeeping.
- **Share link:** `/i/[id]` carries only the id; amount/memo/payee are read from the
  contract, so nothing in the URL can be tampered with.
- **Agent:** chat tools `get_invoices` (summary/totals) and `create_payment_request`
  (returns `pendingAction: { type: "create_request" }` → confirmation card → execute).
- **Entity:** `src/entities/invoice/` (types, abi, `computeInvoiceId`, `readInvoice`,
  `buildRequestLink`, `useMyInvoices`); widget `CreateInvoiceModal`.
- **Env:** `NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS`.

**Why onchain instead of stateless link:** it resolves the "invoice dashboard" DB
trigger up front, a creator's live request list + paid status is read from the
contract, no Blockscout amount-collision ambiguity and no DB. Still source-of-truth
onchain.
**Why it matters:** the real acquisition channel, every request sent surfaces Woosh
to a new person.

---

## RETENTION / DATA (cheap, reuse existing sources)

### 9. Chat spending analytics
**Tool:** new chat tool `analyze_activity` aggregating the SAME Blockscout history already
used by `get_transaction_history`. No new data source, no Supabase.
**Do:** answer "how much did I receive this month", "top senders".
**Acceptance:** chat returns correct monthly totals computed from onchain history.

---

## FUNNEL FIX (same SDK as swap)

### 10. Bridge / Unified Balance on PayPage
**Tool:** Circle **App Kit** Bridge + Unified Balance (wraps CCTP), same SDK as swap.
**Why:** most senders hold USDC on Base/Ethereum, not Arc. Unified Balance lets them pay
an Arc link without knowing a bridge exists. Do this together with swap (one integration).
**Acceptance:** a sender with Base USDC pays an Arc `/pay/[slug]` link successfully.

---

## DEFERRED (real effort or external dependency, not now)

### USYC yield, BLOCKED on external allowlist (start approval NOW, code later)
**Tool:** USYC contract on Arc Testnet; `previewRedeem()` for live price (KudiArc pattern,
no hardcoded APY); deposit/redeem via your `challenge/execute` route pattern.
**Blocker:** Circle USYC allowlist approval (KudiArc waited, approved Mar 2026).
**Action:** submit allowlist application immediately, in parallel. Do NOT put on critical path.

### DCW + cirBTC swap + Recurring — ✅ SHIPPED (V3.0)
**What we built (diverged from the StableFX plan, on purpose):** one DCW executor +
`WooshStrategyRegistry` onchain vault. Recurring payments run trustlessly (contract
forwards). DCA swaps go through **Circle Swap Kit** (`@circle-fin/swap-kit` +
`@circle-fin/adapter-circle-wallets`), NOT StableFX — the Circle Wallets adapter lets the
DCW executor sign the swap directly, and Swap Kit supports cirBTC on Arc (StableFX did not).
Flow: `releaseForSwap` hands the executor one period of USDC → `kit.swap` USDC→token →
forward output to owner. Agent tool is `create_strategy` (kind = payment|swap) returning a
`create_strategy` pendingAction. Cron executor at `/api/cron/execute-strategies`.
**Narrative kept:** lead with USDC↔EURC recurring (FX/salaries/SaaS); cirBTC DCA stays low-key.
**Still open from this cluster:** spend policies / per-strategy caps, and multiple executor
wallets for parallelism (contract holds one `executor` today). Future hardening, not blocking.

### Also deferred (opportunistic, after human-side traction)
- **Fiat off-ramp**, Ramp (cheap EU/SEPA) or Transak (virtual-IBAN, agent flows).
  White-label removes licensing burden (provider holds the license). Sandbox-testable
  before any contract. Still needs a provider account + onboarding.
- **DCW agent wallets + `POST /api/pay` + spend policies**, full autonomous agent payments
  (no human in loop). Separate stack.
- **402 / nanopayments**, machine-to-machine API billing. Different paradigm from Woosh's
  transfer model; only if entering that market deliberately.
- ERC-8183 escrow UI, EURC as a first-class display currency, ZK proofs, opportunistic.

---

## Suggested execution order (by value-per-effort)

```
Done:
  Payment requests/invoices  ✅       onchain WooshInvoiceRegistry, /i/[id], no DB

Start:
  TRACK B: B1 MCP server (independent) repackage 4 chat tools, no DB

Then, nearest onchain wins:
  1. Multi-token balances (EURC, cirBTC)      viem readContract
  2. Swap external-wallet                      App Kit kit.swap (free kit key)
  3. Swap via chat agent                       extend chat tools, pendingAction
  4. Swap via UCW                              StableFX API + signUserTypedData (2 PINs)

Then claim/share (onchain state, no DB):
  5. Gift cards (claim-by-secret)              layered contract
  6. Split-claim                               extend same contract
  7. Tip jar / open-amount                     payment-link variant
  8. QR                                        qrcode over /pay/slug?amount=

Cheap retention:
  9. Chat spending analytics                   aggregate existing Blockscout data

Funnel fix (same SDK as swap):
  10. Bridge / Unified Balance                 App Kit (wraps CCTP)

Off-chain DB: ⚠️ open question, not scheduled, see TRACK A.
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
