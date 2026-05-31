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

### V1 — Web3 Payments (now)
Crypto-to-crypto. User registers with email, gets a
User-Controlled embedded wallet (Circle UCW — PIN or email OTP,
no entity secret, user holds their own keys) and a payment link.
Sender pays USDC from any wallet.
Onboarding guide for senders who need help getting started.

### V2 — Agentic Payments
Woosh as payment infrastructure for AI agents.
REST API for programmatic payments, webhooks on confirmation,
agent wallets, spending limits. See section below.

### V3 — Yield on Balance
Idle USDC earns yield via Aave or USYC (Circle tokenized treasury).
User opts in, withdraw anytime.

### V4 — Web2 Integrations
Fiat on-ramp via Transak — sender pays by card, USDC arrives on Arc.
CCTP bridge from Base/Ethereum for users coming from other chains.
Full no-crypto UX for sender.

---

## Wallet Architecture

Using **User-Controlled Wallets (UCW)** — not Developer-Controlled.

- User holds their own keys (encrypted by their PIN)
- No entity secret required in backend
- Circle SDK renders a secure iframe for PIN entry —
  Woosh never sees the secret
- On receiving payments: no PIN needed, funds arrive automatically
- On sending payments: user enters PIN or email OTP once per tx
- Woosh is never a custodian of user funds

---

## User Flows

### Recipient
1. Signs up with email, sets PIN
2. Circle creates User-Controlled embedded wallet
3. Gets personal payment link → woosh.app/pay/slug
4. Shares link
5. Sees balance + transaction history in dashboard
6. Receiving USDC requires no PIN — funds arrive automatically

### Sender — has wallet (external)
1. Opens /pay/slug
2. Enters amount
3. Connects wallet via WalletConnect
4. Pays USDC on Arc
5. Done — recipient gets funds in <1 second

### Sender — has Woosh account
1. Opens /pay/slug
2. Enters amount
3. Clicks Pay → Circle SDK shows secure PIN iframe
4. Enters PIN → transaction signed and sent
5. Done

### Sender — needs help (no wallet or no USDC)
1. Opens /pay/slug
2. Clicks "I don't know where to start"
3. Onboarding guide (non-blocking, dismissible, single path):
   - Step 1: Create Woosh account → UCW wallet by email + PIN
   - Step 2: Get USDC
             → Testnet: one-click Arc faucet built into guide
             → Mainnet (V2): Transak fiat on-ramp or
               CCTP bridge from Base/Ethereum
   - Step 3: Return and pay
4. If wallet connected but zero USDC on Arc →
   inline banner shown automatically → links to Step 2

---

## Tech Stack

```
Frontend:     Next.js 14 (App Router)
Language:     TypeScript (strict)
Styling:      Tailwind CSS
Web3:         Wagmi + Viem
Wallets:      Circle User-Controlled Wallets SDK (UCW)
              email signup + PIN, secure iframe for signing
On-ramp:      Transak SDK (V2 only)
Network:      Arc testnet → Arc mainnet (summer 2026)
DB:           Supabase (V2, for payment metadata)
```

---

## Core TypeScript Types

```typescript
type User = {
  id: string
  email: string
  walletId: string        // Circle wallet ID
  walletAddress: string   // onchain address on Arc
  paymentSlug: string     // e.g. "alex" → /pay/alex
  createdAt: string
}

type Payment = {
  id: string
  fromAddress: string
  toAddress: string
  amount: string          // USDC, full precision e.g. "100.000000"
  txHash: string
  timestamp: string
  status: 'pending' | 'confirmed' | 'failed'
}

type PaymentLink = {
  slug: string
  ownerAddress: string
  label: string
  createdAt: string
}
```

---

## Pages & Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/signup` | Email + PIN registration, creates UCW wallet |
| `/dashboard` | Balance, tx history, payment link |
| `/pay/[slug]` | Public payment page |

---

## V1 What's Explicitly Out of Scope

- Agentic API / webhooks (V2)
- Yield on balance (V3)
- Transak fiat on-ramp (V4)
- CCTP bridge (V4)
- Invoice PDF export
- Recurring payments
- Multi-recipient / payroll
- Off-ramp to bank/card

---

## Transaction History

V1: read directly from Arc via Viem — no database needed.
`useTransactionHistory(address)` hook fetches onchain data.
V2: add Supabase to store payment metadata (sender name,
description, memo) matched to txHash.

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
Keep this in mind when building every API route:

- All API routes must be stateless and Bearer token ready
- Payment confirmation must be emittable as a webhook —
  design the event now, wire delivery in V2
- All amounts stored and returned with full USDC precision
  (no rounding, no float arithmetic — use string or bigint)
- No assumptions that a human is in the loop in
  business logic — keep UI concerns out of API handlers

---

## V2 — Agentic Payments (future reference)

**What gets added:**
- `POST /api/pay` — programmatic endpoint for agents
  (Bearer token, amount, recipient slug, memo)
- Webhook on tx confirmed → agent continues autonomously
- Agent wallets — UCW or DCW created for AI agents
- Spending limits — per-wallet USDC cap via smart contract

**Scenarios:**
- Agent hires someone → pays on task completion automatically
- Agent manages payroll → distributes USDC without human input
- Agent pays another agent → micro-payments per subtask

---

## Key APIs & Docs

- Arc testnet RPC: `docs.arc.network`
- Circle UCW SDK: `developers.circle.com/w3s/docs`
- Circle Console: `console.circle.com`
- Transak SDK: `docs.transak.com` (V2)
- WalletConnect: `cloud.walletconnect.com`
- Supabase: `supabase.com` (V2)

---

## Environment Variables

```
CIRCLE_API_KEY=                       # backend only
NEXT_PUBLIC_CIRCLE_CLIENT_KEY=        # frontend (UCW SDK)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_ARC_RPC_URL=              # Arc testnet RPC
```