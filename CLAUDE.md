# CLAUDE.md — Woosh Project Context

## What We're Building

**Woosh** — a USDC payment platform for humans and AI agents.
Send a payment link, get paid instantly. No bank, no ETH, no friction.
Built on Arc — the only network where USDC is native gas.

Designed from day one to serve both humans and AI agents.

---

## One-liner

> "Send a link. Get paid in seconds. No bank required."

---

## Problem

Sending money across borders is slow, expensive, and broken.
Traditional providers charge 2–5%, take days, and freeze accounts.
Crypto payment tools require both sides to already be in crypto.
AI agents have no payment infrastructure at all.

Woosh fixes all three.

---

## Why Arc, Not Other Networks

Arc is the only network where:
- USDC is native gas — no ETH needed ever
- Embedded wallet works fully on USDC with zero surcharge
- Sub-second finality
- Circle full-stack integration (Wallets, CCTP, USYC)

"No second token ever" is the killer feature for any user
who isn't already deep in crypto.

---

## Roadmap

### ✅ V1 — Web3 Payments (shipped)

Crypto-to-crypto. User registers with email, gets a
User-Controlled embedded wallet (Circle UCW — email OTP,
no entity secret, user holds their own keys) and a payment link
based on their wallet address (`/pay/0x...`).
Sender pays USDC from any wallet or from their Woosh account.
Onboarding guide for senders who need help getting started.

### ✅ V1.5 — Slug Registry (shipped)

Human-readable payment links stored on-chain.
`/pay/0x1a2b…` becomes `/pay/alex`.

**`WooshSlugRegistry` contract on Arc** (`contracts/src/WooshSlugRegistry.sol`, compiled with Foundry):
```solidity
mapping(string => address) slugToAddress;
mapping(address => string) addressToSlug;

register(string slug)       // registers slug, enforces uniqueness on-chain
isAvailable(string slug)    // read-only availability check
```

**Slug rules:** 3–32 chars, lowercase a-z, 0-9, underscore. No other chars.

**Post-login flow:**
1. After signup → always redirected to `/dashboard`
2. Dashboard shows "Claim a username" CTA (top-right of payment link card) if no slug yet
3. `/slug-setup` pre-fills slug from email (part before @), normalized
4. Debounced `isAvailable()` check on every keystroke (500ms, status: idle/checking/available/taken/invalid/error)
5. If taken → suggest readable alternatives: `alex1`, `alex_pay`, `alex2026`
6. Submit → re-auth via email OTP → `register(slug)` tx via Circle UCW SDK (PIN)
7. Slug written to localStorage session; `/pay/[slug]` resolves via contract

**Note:** signup no longer force-redirects to `/slug-setup`. Slug claim is voluntary from dashboard.

**Route:** `/pay/[slug]` — resolver calls `slugToAddress[slug]` server-side.
If param is a 0x address, passes through directly (backwards compat).

### ✅ V2a — Woosh Agent Chat (shipped)

Natural language interface in the dashboard. User types in plain English;
Woosh Agent (Claude via OpenRouter) parses intent, executes safe reads,
and returns a confirmation card before any send.

**Architecture:**
- `POST /api/chat` — manual agentic loop (max 4 iters), OpenRouter → Claude
- Tools: `get_balance` (viem RPC), `get_transaction_history` (Blockscout), `send_payment`
- `send_payment` never auto-executes — server resolves recipient slug first
  (unknown slug → Claude asks user to clarify), then returns `{text, pendingAction}` to frontend
- Confirmation card shows: "Send $10.00 to alex (…a3f2)?" — last 4 chars of resolved address
- On confirm → `router.push(/pay/${to}?amount=${amount})` — pay page pre-fills amount

**Tool registry (extensible):**
```typescript
// src/features/chat/model/registry.ts — side-effect registry
// src/features/payments/chat-tools.ts — registers payment tool examples
// Adding a new tool: create a feature file, call registerToolExamples(), import in /api/chat
```

**Chat state:** persisted in sessionStorage (`woosh_chat_history`), cleared on logout. Supabase later.

**Env:** `OPENROUTER_API_KEY`, `ANTHROPIC_MODEL` (default: `anthropic/claude-3-5-sonnet`)

### ✅ V2b — Direct Sends from Chat (shipped)

ChatPanel executes payments in place — no redirect:
- On confirm: tries cached Circle userToken from sessionStorage (`woosh_session_token`)
  → `POST /api/wallet/send-payment` → challengeId → `sdk.execute()` (PIN iframe)
- If no/expired token: email OTP flow inline in chat, then execute
- Status bubbles: confirmed → sending → paid (explorer link) / send_error
- User slug + wallet address passed in chat request body, injected into system prompt

**Unmerged:** branch `temp/improvements` has rate limiting on `/api/chat`,
slug resolution in TransactionList (`useSlugMap`), optimistic pending tx entries,
and a post-signup slug claim prompt. Merge after stabilization.

### 🔄 V2c — Stabilization + Persistence (next)

**See `docs/IMPLEMENTATION_PLAN.md` — execute in order.** Summary:
- **Phase 0 (bugs):** stale-closure payment details in PaymentForm (PIN window shows
  previous payment), shared W3SSdk singleton (`src/shared/lib/w3s.ts`), central session
  module with complete logout cleanup, 401 mapping for expired Circle tokens,
  string-only amount handling
- **Phase 1:** merge `temp/improvements` with fixes
- **Phase 2 (80/20):** Supabase metadata layer → off-chain payment requests (`/r/[id]`)
  → Woosh MCP server → Gateway/CCTP on PayPage

### 🔮 V3 — Agentic Rail + Fiat

- Woosh MCP server — existing chat tools repackaged for any MCP agent (pulled into V2c Phase 2)
- Gateway/CCTP bridge on PayPage — sender pays Arc link with USDC from Base/Ethereum
  (Circle App Kit; pulled into V2c Phase 2)
- DCW agent wallets + `POST /api/pay` + spend policies (after MCP proves demand)
- Fiat on-ramp via Transak — card → USDC on Arc

### 🔮 V4 — Recurring Payments

**`WooshSubscription` contract:**
- Sender pre-authorizes: `maxAmount` + `period` (daily/weekly/monthly)
- Recipient calls `pull()` each period to collect
- Sender revokes authorization anytime
- Use cases: SaaS, memberships, salary

---

## Wallet Architecture

Using **User-Controlled Wallets (UCW)** for humans — not Developer-Controlled.

- User holds their own keys (encrypted by their PIN)
- No entity secret required in backend
- Circle SDK renders a secure iframe for PIN entry —
  Woosh never sees the secret
- On receiving payments: no PIN needed, funds arrive automatically
- On sending payments: user enters PIN or email OTP once per tx
- Woosh is never a custodian of user funds

**V2+ Agent wallets:** Developer-Controlled Wallets (DCW) for AI agents —
programmatic signing, no user interaction required.

---

## Smart Contracts Reference

| Contract | Address | Version |
|----------|---------|---------|
| `WooshSlugRegistry` | set via `NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS` | ✅ V1.5 |
| USDC on Arc Testnet | `0x3600000000000000000000000000000000000000` | all |

---

## User Flows

### Recipient (V1)
1. Signs up with email, enters OTP
2. Circle creates User-Controlled embedded wallet
3. Gets personal payment link → `woosh.app/pay/0x...`
4. Shares link
5. Sees balance + transaction history in dashboard

### Recipient (V1.5+)
After step 2:
- Always redirected to `/dashboard` (slug claim is voluntary)
- Dashboard shows "Claim a username" CTA in payment link card
- Clicking it opens `/slug-setup`: pre-filled slug, on-chain availability check, OTP re-auth, PIN challenge
- Payment link becomes `woosh.app/pay/yourname` after claiming

### Sender — has wallet (external)
1. Opens `/pay/[slug]`
2. Enters amount
3. Connects wallet via WalletConnect
4. Pays USDC on Arc
5. Done — recipient gets funds in <1 second

### Sender — has Woosh account
1. Opens `/pay/[slug]`
2. Enters amount
3. Clicks Pay → Circle SDK shows secure PIN iframe
4. Enters PIN → transaction signed and sent

### Sender — needs help (no wallet or no USDC)
1. Opens `/pay/[slug]`
2. Clicks "I don't know where to start"
3. Onboarding guide (non-blocking, dismissible):
   - Step 1: Create Woosh account → UCW wallet by email + PIN
   - Step 2: Get USDC → "Go to faucet" button opens Arc faucet in new tab
             → Mainnet (V4): Transak fiat on-ramp or CCTP bridge
   - Step 3: Return and pay
4. Zero USDC banner shown automatically if wallet connected but empty

---

## Tech Stack

```
Frontend:     Next.js 14 (App Router)
Language:     TypeScript (strict)
Styling:      Tailwind CSS
Web3:         Wagmi + Viem
Wallets:      Circle User-Controlled Wallets SDK (UCW)
              email OTP, secure iframe for signing
AI:           Claude via OpenRouter (openai npm pkg, baseURL: openrouter.ai/api/v1)
              ANTHROPIC_MODEL env var (default: anthropic/claude-3-5-sonnet)
Contracts:    Solidity on Arc (Foundry)
Network:      Arc Testnet → Arc Mainnet (summer 2026)
DB:           None in V1/V1.5/V2a (on-chain is source of truth)
              Supabase in V2b (payment metadata, chat history)
```

---

## Core TypeScript Types

```typescript
type Session = {
  email: string
  walletAddress: `0x${string}`
  slug?: string               // undefined until set in V1.5
}

type User = {
  id: string
  email: string
  walletId: string            // Circle wallet ID
  walletAddress: string       // onchain address on Arc
  slug: string                // e.g. "alex" → /pay/alex
  createdAt: string
}

type Payment = {
  id: string
  fromAddress: string
  toAddress: string
  amount: string              // USDC, full precision e.g. "100.000000000000000000"
  txHash: string
  timestamp: string
  status: 'pending' | 'confirmed' | 'failed'
}

type PaymentRequest = {       // V2
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

## Dashboard Layout (V2a)

```
Header (BrandHeader + email + logout)
└── AccountBar — balance (left), copy payment link + claim username (right)
└── ChatPanel — Woosh Agent chat with typewriter placeholder
    └── messages (bottom-aligned), typing indicator (3 bounce dots)
    └── send_payment: confirmation card with recipient + address suffix
└── TransactionList — last 3 txs, "View all" link if >3
/dashboard/history — full transaction list with refresh
```

## Pages & Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/signup` | Email + OTP registration, creates UCW wallet |
| `/slug-setup` | One-time slug registration (V1.5, voluntary from dashboard) |
| `/dashboard` | Balance + chat + last 3 txs |
| `/dashboard/history` | Full transaction history |
| `/pay/[slug]` | Public payment page — slug resolved via SlugRegistry; supports `?amount=` pre-fill |

---

## What's Out of Scope

**Not planned:**
- ERC-8183 agentic job escrow (UI later, only if agent volume appears)
- WooshPaymentRequest on-chain invoices (off-chain Supabase rows first)
- Webhook delivery
- Payment splits, vouchers, milestone escrow
- Yield on balance (too complex without custody)
- Invoice PDF export, payroll, off-ramp to bank (HIFI later if demanded)

**V2c (next):** stabilization fixes + merge `temp/improvements` + Supabase metadata +
off-chain payment requests + MCP server + Gateway on PayPage — see `docs/IMPLEMENTATION_PLAN.md`

**V3 (future):** DCW agent wallets, `POST /api/pay`, spend policies, fiat on-ramp (Transak)

**V4 (future):** recurring payments / subscriptions, off-ramp, EURC

---

## Transaction History

V1/V1.5: read from Blockscout v2 API server-side — no database needed.
`useTransactionHistory(address)` hook fetches via `/api/transactions/[address]`.
V2: add Supabase to store payment metadata (sender name, description, memo)
matched to txHash.

---

## Visual Style

- Minimal fintech — Stripe meets Linear
- Dark background: `#0A0F1E` (deep navy)
- Primary accent: `#0EA5E9` (electric blue)
- Secondary accent: `#06B6D4` (cyan)
- Text primary: `#F1F5F9`
- Text secondary: `#64748B`
- Cards: `#111827` with 1px border `#1E293B`
- Border radius: 12px cards, 8px inputs
- Font: Inter
- No gradients on UI elements
- Subtle blue glow on primary CTA only
- Mobile-first, lots of whitespace

---

## Key UX Principles

- Zero crypto jargon visible to end user
- No MetaMask prompts, no seed phrases, no network switching
- All amounts shown in USD, USDC under the hood
- Instant tx confirmation feedback
- Onboarding guide always accessible, never blocking
- PIN entry via Circle's secure iframe — never in Woosh UI directly

---

## API Design Principles (applies from V1)

Woosh serves both humans and AI agents as first-class users.

- All API routes must be stateless and Bearer token ready
- Payment confirmation must be emittable as a webhook —
  design the event now, wire delivery in V2
- All amounts stored and returned with full USDC precision
  (no rounding, no float arithmetic — use string or bigint)
- No assumptions that a human is in the loop in
  business logic — keep UI concerns out of API handlers

---

## Key APIs & Docs

- Arc testnet RPC: `docs.arc.network`
- Circle UCW SDK: `developers.circle.com/w3s/docs`
- Circle Console: `console.circle.com`
- Transak SDK: `docs.transak.com` (V3)
- WalletConnect: `cloud.walletconnect.com`
- Supabase: `supabase.com` (V2b)

---

## Environment Variables

```
# Circle
CIRCLE_API_KEY=                          # backend only
NEXT_PUBLIC_CIRCLE_APP_ID=               # frontend (UCW SDK)

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Arc Network
NEXT_PUBLIC_ARC_RPC_URL=                 # default: https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_CHAIN_ID=                # default: 5042002
NEXT_PUBLIC_ARC_EXPLORER_URL=            # default: https://testnet.arcscan.app
NEXT_PUBLIC_ARC_FAUCET_URL=              # default: https://faucet-testnet.arc.network
NEXT_PUBLIC_BASE_URL=

# Smart Contracts
NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS=       # WooshSlugRegistry (V1.5, deploy with Foundry)

# Woosh Agent (V2a)
OPENROUTER_API_KEY=                      # openrouter.ai/keys
ANTHROPIC_MODEL=                         # default: anthropic/claude-3-5-sonnet
```
