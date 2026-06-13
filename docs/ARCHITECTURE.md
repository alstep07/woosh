# Architecture — Woosh

## Where Data Lives — No Off-Chain Storage by Default (read first)

> This rule exists because we almost added a Supabase `users`/`gift_cards` layer
> that duplicated data already living on-chain. Don't repeat that.

**Default: there is NO backend database.** On-chain + Blockscout is the source of
truth. A datastore is added ONLY when a feature needs state that has *no* on-chain
home AND *cannot be derived* — and that need is proven, not assumed.

**Before storing anything off-chain, run it through this gate. If any answer is
"yes", it does NOT go in a DB:**

1. Is it already on-chain? (balances, token amounts, slug ownership, who-claimed,
   claimed/unclaimed status, contract state, tx sender/recipient)
2. Does Circle already hold it? (email ↔ wallet mapping — Circle resolves the same
   wallet from the same email via `listWallets(userToken)`; we never store this)
3. Can it be encoded in the link itself? (a payment request = `/pay/slug?amount=…` —
   the URL *is* the request; no row needed)
4. Can it be derived from Blockscout? (paid / unpaid status of a request, history,
   counterparties, totals)

**What legitimately has no home** (and would justify a DB *when the feature ships*):
purely human-meaningful text with no on-chain representation — a gift-card *message*,
a tx *memo/label*. Even these are small and optional; prefer link-encoding or
on-chain calldata/events first.

**Worked examples (the actual analysis that produced this rule):**

| Candidate | Verdict | Why |
|-----------|---------|-----|
| wallet address | on-chain / Circle | `listWallets(userToken)`, keyed on email |
| slug | on-chain | `WooshSlugRegistry`, `lookupAddressSlug()` |
| balance, tx history | on-chain / Blockscout | source of truth |
| payment request (amount, recipient, memo) | encode in link | `/pay/slug?amount=` |
| invoice paid? | derive | Blockscout polling |
| gift card: amount / status / claimed_by | on-chain | vault contract state + claim tx |
| gift card: message | **off-chain OK** | human text, no on-chain home |
| chat history | client | sessionStorage today |

**Anti-pattern:** mirroring an on-chain fact into a DB "for convenience / as a cache /
for portability." A stale mirror can return *wrong* data and silently overrides the
chain. Read from chain; don't shadow it. Portability is already solved by Circle
(email → wallet) + on-chain reads.

---

## Wallet Architecture

### UCW — User-Controlled Wallets (humans)
- User holds their own keys, encrypted by PIN
- No `entitySecret` on backend — Woosh is never a custodian
- Circle SDK renders a secure iframe for PIN entry
- Receiving: no PIN needed, funds arrive automatically
- Sending / signing: user enters PIN once per action
- **Cannot be used for autonomous/scheduled operations** — requires human PIN each time

### DCW — Developer-Controlled Wallets (agents, V3+)
- Woosh holds `entitySecret` server-side
- Programmatic signing, no user interaction
- Required for: recurring payments, DCA strategies, any no-human-in-loop operation
- Not implemented yet — planned for V3

### challenge/execute pattern (applies to ALL on-chain actions)
```
server: create challenge via Circle API → { challengeId }
client: sdk.execute(challengeId, callback) → PIN iframe → signed tx broadcast
```
Examples already in use:
- `createTransaction` → send USDC payment (`src/shared/lib/circle.ts`)
- `createUserTransactionContractExecutionChallenge` → register slug on-chain
- `signUserTypedData` → sign EIP-712 data (used for StableFX swap flow)

---

## Smart Contracts

| Contract | Address | Notes |
|----------|---------|-------|
| `WooshSlugRegistry` | `NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS` | Deployed via Foundry |
| `WooshInvoiceRegistry` | `NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS` | Payment requests. `pay(payee,amount,nonce)` payable, forwards exact native value, records `paid[id]`. Custodies nothing. |
| USDC (native) | `0x3600000000000000000000000000000000000000` | 18 decimals on Arc |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 decimals, ERC-20 |
| USYC | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` | Yield token, allowlist required |
| FxEscrow (StableFX) | `0x867650F5eAe8df91445971f14d89fd84F0C9a9f8` | Proxy → impl `0x721eAFa9C1e38DD7fFf81d30ea1a5500b37Cf658` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Required for StableFX |
| CCTP TokenMessengerV2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | Bridge |

`WooshSlugRegistry` source: `contracts/src/WooshSlugRegistry.sol`
Deploy: `forge create contracts/src/WooshSlugRegistry.sol:WooshSlugRegistry --rpc-url https://rpc.testnet.arc.network --private-key $KEY`

---

## FSD Structure

```
src/
  shared/        config/env.ts, lib/{arc,circle,session,w3s,wagmi,time}.ts, ui/
  entities/      payment/, wallet/, user/, slug/
  features/      auth/, chat/, payments/
  widgets/       ChatPanel, PaymentForm, TransactionList, BalanceCard, ...
  views/         DashboardPage, SignupPage, PayPage, SlugSetupPage, ...
app/             thin Next.js routing shells + API routes
```

---

## Pages & Routes

| Route | View | Notes |
|-------|------|-------|
| `/` | `HomePage` | Landing, LiquidHero |
| `/signup` | `SignupPage` | Email OTP → UCW wallet creation |
| `/slug-setup` | `SlugSetupPage` | Voluntary from dashboard |
| `/dashboard` | `DashboardPage` | Balance + chat + last 3 txs |
| `/dashboard/history` | `DashboardHistoryPage` | Full tx list |
| `/pay/[slug]` | `PayPage` | 0x address or slug, `?amount=` pre-fill |

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/wallet/request-otp` | POST | Email OTP → `{deviceToken, otpToken}` |
| `/api/wallet/initialize` | POST | Create wallet challenge → `{challengeId}` |
| `/api/wallet/complete` | POST | Poll Circle for wallet address after PIN |
| `/api/wallet/send-payment` | POST | Create transfer challenge → `{challengeId}` |
| `/api/slug/register` | POST | Create contract execution challenge for slug |
| `/api/transactions/[address]` | GET | Blockscout v2, last 20 txs |
| `/api/chat` | POST | Agentic loop, max 4 iters, OpenRouter → Claude |

---

## Core TypeScript Types

```typescript
type Session = {
  email: string
  walletAddress: `0x${string}`
  slug?: string
}

type Payment = {
  id: string
  fromAddress: string
  toAddress: string
  amount: string        // full precision string, e.g. "100.000000000000000000"
  txHash: string
  timestamp: string
  status: 'pending' | 'confirmed' | 'failed'
}

type PaymentRequest = {  // planned V2c
  requestId: string
  toSlug: string
  toAddress: string
  amount: string
  description: string
  expiresAt: string | null
  paid: boolean
}
```

---

## API Design Principles

- All routes stateless, Bearer token ready
- Amounts always string or bigint — no float, no rounding
- No assumptions a human is in the loop in business logic
- UCW `userToken` validated by Circle server-side — no Woosh-side JWT middleware
- Auth errors from Circle (code 90001, "invalid user token") mapped to 401 in `/api/wallet/send-payment`

---

## Dashboard Layout

```
BrandHeader (email + logout)
AccountBar   — balance | copy link + claim username CTA
ChatPanel    — Woosh Agent, typewriter placeholder, confirmation cards
TransactionList — last 3, "View all" → /dashboard/history
```

---

## Transaction History

Source of truth: Blockscout v2 API (`/api/v2/addresses/{address}/transactions`).
Hook: `useTransactionHistory(address)` → `GET /api/transactions/[address]`.
No database. A datastore is only introduced if a feature needs off-chain state per
the "Where Data Lives" gate above — currently nothing does.
