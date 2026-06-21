# Architecture, Woosh

## Where Data Lives, No Off-Chain Storage by Default (read first)

> This rule exists because we almost added a Supabase `users`/`gift_cards` layer
> that duplicated data already living onchain. Don't repeat that.

**Default: there is NO backend database.** Onchain + Blockscout is the source of
truth. A datastore is added ONLY when a feature needs state that has *no* onchain
home AND *cannot be derived*, and that need is proven, not assumed.

**Before storing anything off-chain, run it through this gate. If any answer is
"yes", it does NOT go in a DB:**

1. Is it already onchain? (balances, token amounts, slug ownership, who-claimed,
   claimed/unclaimed status, contract state, tx sender/recipient)
2. Does Circle already hold it? (email ↔ wallet mapping, Circle resolves the same
   wallet from the same email via `listWallets(userToken)`; we never store this)
3. Can it be encoded in the link itself? (e.g. `/pay/slug?amount=…`, the URL *is* the
   request; no row needed. Note: standalone invoices went one step further and live
   onchain in `WooshInvoiceRegistry`, with the link carrying only the id)
4. Can it be derived from Blockscout? (paid / unpaid status of a request, history,
   counterparties, totals)

**What legitimately has no home** (and would justify a DB *when the feature ships*):
purely human-meaningful text with no onchain representation, a gift-card *message*,
a tx *memo/label*. Even these are small and optional; prefer link-encoding or
onchain calldata/events first.

**Worked examples (the actual analysis that produced this rule):**

| Candidate | Verdict | Why |
|-----------|---------|-----|
| wallet address | onchain / Circle | `listWallets(userToken)`, keyed on email |
| slug | onchain | `WooshSlugRegistry`, `lookupAddressSlug()` |
| balance, tx history | onchain / Blockscout | source of truth |
| payment request (amount, payee, memo) | onchain | `WooshInvoiceRegistry`, link carries only the id (`/i/[id]`) |
| invoice paid? / my invoices list | onchain | `getInvoice(id)`, `getInvoiceIds(creator)` |
| gift card: amount / status / claimed_by | onchain | vault contract state + claim tx |
| gift card: message | **off-chain OK** | human text, no onchain home |
| chat history | client | sessionStorage today |

**Anti-pattern:** mirroring an onchain fact into a DB "for convenience / as a cache /
for portability." A stale mirror can return *wrong* data and silently overrides the
chain. Read from chain; don't shadow it. Portability is already solved by Circle
(email → wallet) + onchain reads.

---

## Wallet Architecture

### UCW, User-Controlled Wallets (humans)
- User holds their own keys, encrypted by PIN
- No `entitySecret` on backend, Woosh is never a custodian
- Circle SDK renders a secure iframe for PIN entry
- Receiving: no PIN needed, funds arrive automatically
- Sending / signing: user enters PIN once per action
- **Cannot be used for autonomous/scheduled operations**, requires human PIN each time

### DCW, Developer-Controlled Wallets (executor, V3.0 ✅)
- Woosh holds `entitySecret` server-side (`CIRCLE_ENTITY_SECRET`, never client-exposed)
- Programmatic signing, no user interaction
- Implemented as the single shared **strategy executor** wallet (`src/shared/lib/dcw.ts`):
  one DCW EOA, set as `WooshStrategyRegistry.executor`, funded with USDC for gas.
- Triggers `executePayment`/`releaseForSwap` on schedule, and signs DCA swaps through the
  Circle Wallets adapter (`createCircleWalletsAdapter`, `src/shared/lib/swap.ts`), no raw key.
- It does NOT custody user funds: strategy budgets live in the contract vault per strategy.
- Provision once via `POST /api/admin/provision-executor` (CRON_SECRET-protected).

### challenge/execute pattern (applies to ALL onchain actions)
```
server: create challenge via Circle API → { challengeId }
client: sdk.execute(challengeId, callback) → PIN iframe → signed tx broadcast
```
Examples already in use:
- `createTransaction` → send USDC payment (`src/shared/lib/circle.ts`)
- `createUserTransactionContractExecutionChallenge` → register slug onchain
- `signUserTypedData` → sign EIP-712 data (used for StableFX swap flow)

---

## Smart Contracts

| Contract | Address | Notes |
|----------|---------|-------|
| `WooshSlugRegistry` | `NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS` | Deployed via Foundry |
| `WooshInvoiceRegistry` | `NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS` | Payment requests / invoices. `create(salt, amount, memo)` stores the request under `id = keccak256(creator, salt)`; `pay(id)` payable enforces exact `msg.value` and forwards it to the payee; `getInvoice(id)` / `getInvoiceIds(creator)` for reads. Custodies nothing between create and pay. |
| `WooshStrategyRegistry` | `NEXT_PUBLIC_STRATEGY_REGISTRY_ADDRESS` | Automated strategies (V3.0). Vault custodies native USDC + stores schedule under `id = keccak256(owner, salt)`. Two kinds: Payment (contract forwards to recipient each period, trustless) and Swap/DCA (`releaseForSwap` hands one period to the `executor`, which swaps off-chain and forwards to owner). Owner: `create`/`fund`/`pause`/`resume`/`cancel` (refund). Executor-only: `executePayment`/`releaseForSwap` advance the schedule atomically. `getStrategy`/`getStrategyIds`/`getStrategiesBatch`/`allIds` reads. Statuses: Active/Paused/Completed/Cancelled/Depleted. |
| USDC (native) | `0x3600000000000000000000000000000000000000` | 18 decimals on Arc |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 decimals, ERC-20 |
| USYC | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` | Yield token, allowlist required |
| FxEscrow (StableFX) | `0x867650F5eAe8df91445971f14d89fd84F0C9a9f8` | Proxy → impl `0x721eAFa9C1e38DD7fFf81d30ea1a5500b37Cf658` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Required for StableFX |
| CCTP TokenMessengerV2 | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | Bridge |

Sources: `contracts/src/WooshSlugRegistry.sol`, `contracts/src/WooshInvoiceRegistry.sol`, `contracts/src/WooshStrategyRegistry.sol`
Deploy: `forge create contracts/src/WooshSlugRegistry.sol:WooshSlugRegistry --rpc-url https://rpc.testnet.arc.network --private-key $KEY --broadcast`
Deploy: `forge create contracts/src/WooshInvoiceRegistry.sol:WooshInvoiceRegistry --rpc-url https://rpc.testnet.arc.network --private-key $KEY --broadcast`
Deploy: `forge create contracts/src/WooshStrategyRegistry.sol:WooshStrategyRegistry --rpc-url https://rpc.testnet.arc.network --private-key $KEY --broadcast`
After deploying the strategy registry: `cast send <addr> "setExecutor(address)" <EXECUTOR_ADDRESS> ...` and fund the executor with USDC for gas.

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
| `/dashboard/invoices` | `RequestsPage` | "My invoices", reads `getInvoiceIds(creator)` from chain |
| `/dashboard/strategies` | `StrategiesPage` | Recurring payments + DCA, reads `getStrategyIds(owner)` from chain; create/fund/pause/resume/cancel modals |
| `/pay/[slug]` | `PayPage` | 0x address or slug, `?amount=` pre-fill |
| `/i/[id]` | invoice pay page | Reads the invoice from `WooshInvoiceRegistry`, locks amount/memo |

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/wallet/request-otp` | POST | Email OTP → `{deviceToken, otpToken}` |
| `/api/wallet/initialize` | POST | Create wallet challenge → `{challengeId}` |
| `/api/wallet/complete` | POST | Poll Circle for wallet address after PIN |
| `/api/wallet/send-payment` | POST | Create transfer challenge → `{challengeId}` |
| `/api/wallet/create-invoice` | POST | Create `WooshInvoiceRegistry.create` challenge → `{challengeId}` |
| `/api/wallet/pay-invoice` | POST | Create `WooshInvoiceRegistry.pay` challenge → `{challengeId}` |
| `/api/wallet/create-strategy` | POST | Create `WooshStrategyRegistry.create` (payable) challenge; resolves payment recipient slug |
| `/api/wallet/fund-strategy` | POST | Create `fund(id)` challenge |
| `/api/wallet/manage-strategy` | POST | Create `pause`/`resume`/`cancel` challenge |
| `/api/cron/execute-strategies` | GET/POST | Executor: runs due strategies (payments + DCA swaps). `CRON_SECRET`-auth, time-budgeted, idempotent |
| `/api/admin/provision-executor` | POST | One-time: create the DCW executor wallet. `CRON_SECRET`-auth |
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
- Amounts always string or bigint, no float, no rounding
- No assumptions a human is in the loop in business logic
- UCW `userToken` validated by Circle server-side, no Woosh-side JWT middleware
- Auth errors from Circle (code 90001, "invalid user token") mapped to 401 in `/api/wallet/send-payment`

---

## Dashboard Layout

```
BrandHeader (email + logout)
AccountBar:  balance | copy link + claim username CTA
ChatPanel:   Woosh Agent, typewriter placeholder, confirmation cards
TransactionList: last 3, "View all" → /dashboard/history
```

---

## Transaction History

Source of truth: Blockscout v2 API (`/api/v2/addresses/{address}/transactions`).
Hook: `useTransactionHistory(address)` → `GET /api/transactions/[address]`.
No database. A datastore is only introduced if a feature needs off-chain state per
the "Where Data Lives" gate above, currently nothing does.
