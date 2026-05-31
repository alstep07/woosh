# CLAUDE.md — Woosh Project Context

## What We're Building

**Woosh** — a cross-border USDC payment platform for freelancers
from emerging markets (UA, AR, NG, PK) where recipients get paid
instantly via a payment link, and senders can pay with USDC from
any wallet. No bank, no ETH, no friction.

---

## One-liner

> "Send a link. Get paid in seconds. No bank required."

---

## Problem

Freelancers in emerging markets lose $600+/year on fees from
traditional payment providers. Many providers have poor coverage
for local banks or freeze accounts without warning. Crypto
invoicing tools require both sides to already be in crypto.

Woosh removes the barrier on both sides.

---

## Why Arc, Not Other Networks

Arc is the only network where:
- USDC is native gas — no ETH needed ever
- Embedded wallet works fully on USDC with zero surcharge
- Sub-second finality
- Circle full-stack integration (Wallets, CCTP, USYC)

For a payment product targeting non-crypto users,
"no second token ever" is the killer feature.

---

## Roadmap

### V1 — Web3 Payments (now)
Crypto-to-crypto. Recipient registers with email, gets embedded
wallet and payment link. Sender pays USDC from any wallet.
Onboarding guide for senders who need help getting started.

### V2 — Web2 Integrations
Fiat on-ramp via Transak — client pays by card, USDC arrives on Arc.
Full no-crypto UX for sender.

### V3 — Yield on Balance
Idle USDC earns yield via Aave or USYC (Circle tokenized treasury).
User opts in, withdraw anytime.

---

## User Flows

### Recipient (freelancer)
1. Signs up with email
2. Circle creates embedded wallet automatically
3. Gets personal payment link → woosh.app/pay/username
4. Shares link with client
5. Sees balance + transaction history in dashboard

### Sender (client) — happy path
1. Opens /pay/username
2. Enters amount
3. Connects wallet (MetaMask, Coinbase Wallet, WalletConnect)
4. Pays USDC on Arc
5. Done — recipient gets funds in <1 second

### Sender — needs help (no wallet or no USDC)
1. Opens /pay/username
2. Sees payment form
3. Clicks "I don't know where to start"
4. Onboarding guide appears (3 steps, single path):
   - Step 1: Create a Woosh account → embedded wallet
             created by email, no MetaMask, no seed phrases
   - Step 2: Get USDC
             → Testnet: one-click Arc faucet built into guide
             → Mainnet (V2): Transak fiat on-ramp or
               CCTP bridge from Base/Ethereum
               (direct Binance→Arc not available until
               Arc is listed as withdrawal network on exchanges)
   - Step 3: Return to payment page and pay
5. Guide is non-blocking — dismissible at any time
6. Only one path shown — no wallet choices, no confusion

### Sender — has wallet, no USDC
1. Opens /pay/username
2. Connects wallet
3. App detects zero USDC balance on Arc
4. Shows inline banner: "You need USDC on Arc to pay.
   Here's how to get some →"
5. Same guide, jumps directly to Step 2

---

## Tech Stack

```
Frontend:     Next.js 14 (App Router)
Language:     TypeScript
Styling:      Tailwind CSS
Web3:         Wagmi + Viem
Wallets:      Circle Programmable Wallets SDK
              (embedded wallet by email for recipients)
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
  walletAddress: string   // onchain address
  paymentSlug: string     // e.g. "alex" → /pay/alex
  createdAt: string
}

type Payment = {
  id: string
  fromAddress: string
  toAddress: string
  amount: string          // in USDC, e.g. "100.00"
  txHash: string
  timestamp: string
  status: 'pending' | 'confirmed' | 'failed'
}

type PaymentLink = {
  slug: string
  ownerAddress: string
  label: string           // display name
  createdAt: string
}
```

---

## Pages & Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/signup` | Email registration, creates embedded wallet |
| `/dashboard` | Balance, transaction history, payment link |
| `/pay/[slug]` | Public payment page for clients |

---

## V1 What's Explicitly Out of Scope

- Transak fiat on-ramp (V2)
- Yield on balance (V3)
- Invoice PDF export
- Recurring payments
- Multi-recipient / payroll
- Off-ramp to local bank/card

---

## Transaction History

V1: read directly from Arc via Viem — no database needed.
`useTransactionHistory(address)` hook fetches onchain data.
V2: add Supabase to store payment metadata (sender name,
description, amount label) matched to txHash.

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
- Onboarding guide is always accessible, never blocking

---

## Key APIs & Docs

- Arc testnet RPC: check `docs.arc.network`
- Circle Wallets SDK: `developers.circle.com/w3s/docs`
- Transak SDK: `docs.transak.com` (V2)
- Arc docs: `docs.arc.network`
- Arc House: `community.arc.io`

---

## Competitive Position

| | Card payment | No wallet needed | Works in UA |
|---|---|---|---|
| Coinbase Commerce | ❌ | ❌ | ✅ |
| Request Network | ❌ | ❌ | ✅ |
| Payoneer | ✅ | ✅ | ⚠️ |
| **Woosh V1** | ❌ | ✅ recipient | ✅ |
| **Woosh V2** | ✅ | ✅ both | ✅ |

---