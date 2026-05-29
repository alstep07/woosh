# CLAUDE.md — Project Context

## What We're Building

**Woosh** — a payment tool for freelancers from emerging markets (UA, AR, NG, PK) where a client pays with a card as usual, and the recipient receives USDC in under a second — no wallet setup, no bank, no ETH.

The core insight: the only network where an embedded wallet works entirely on USDC (gas included) without a second token or developer gas subsidies is Arc.

---

## One-liner

> "The first payment tool where a client pays by card and a freelancer in Ukraine receives USDC instantly — without ever touching a crypto wallet."

---

## Problem

Freelancers in emerging markets lose $600+/year on fees from traditional payment providers. Many providers have poor coverage for local banks or freeze accounts without warning. Crypto invoicing tools require both sides to already be in crypto.

Woosh removes the barrier on both sides.

---

## How It Works

**Recipient (freelancer, once):**
Signs up with email → Circle creates an embedded wallet under the hood → gets a personal payment link

**Sender (client, each time):**
Opens the link → enters amount → pays by card via Transak → done

**Under the hood:**
Transak converts fiat to USDC → sends to Arc → freelancer sees balance in a dashboard like a normal bank account

---

## Why Arc, Not Other Networks

Arc is the only network where:
- USDC is native gas — no ETH needed ever
- Embedded wallet works fully on USDC with zero surcharge
- On other EVM networks: paymasters often add a surcharge OR the developer subsidizes gas
- Sub-second finality vs multi-second confirmation on typical alternatives

For a payment product targeting non-crypto users, "no second token ever" is the killer feature.

---

## Tech Stack

```
Frontend:     Next.js (App Router)
Web3:         Wagmi + Viem
Wallets:      Circle Programmable Wallets SDK (embedded wallet by email)
On-ramp:      Transak SDK (card → USDC for client)
Network:      Arc testnet → Arc mainnet (summer 2026)
Styling:      Tailwind CSS
```

---

## Roadmap

| Version | What | Timeline |
|---------|------|----------|
| **V1** | Payment Link — email signup, embedded wallet, card payment, USDC settlement | Now (1-2 weeks) |
| **V2** | Invoicing — invoice with description, amount, deadline, PDF export, payment history | Next |
| **V3** | Recurring Payments — smart contract for retainers and subscriptions | After V2 |
| **V4** | Payroll — one sender → multiple recipients in one transaction | After V3 |
| **V5** | Full Payment OS — fiat off-ramp to local cards/banks, country localization | Long-term |

---

## V1 Scope (Build This First)

### Core User Stories

1. **Freelancer registers** with email → embedded wallet created automatically
2. **Freelancer gets a payment link** → `/pay/username` or unique slug
3. **Client opens link** → sees amount field + "Pay with card" button
4. **Client pays by card** via Transak widget → USDC sent to freelancer's Arc wallet
5. **Freelancer sees balance** and transaction history in dashboard

### What's NOT in V1
- Off-ramp (fiat withdrawal) — user manages this themselves
- Invoice PDF
- Recurring payments
- Multi-recipient

---

## Key APIs & Docs

- Arc testnet RPC: `https://rpc.arc.network` (check docs.arc.network)
- Circle Wallets SDK: `https://developers.circle.com/w3s/docs`
- Transak SDK: `https://docs.transak.com`
- Arc docs: `https://docs.arc.network`
- Arc House (community): `https://community.arc.io`

---

## Competitive Position

| | Client pays by card | Recipient needs no wallet | Works in UA |
|---|---|---|---|
| Crypto invoicing tools | ❌ | ❌ | ✅ |
| Traditional payment providers | ✅ | ✅ | ⚠️ partial |
| **Woosh** | ✅ | ✅ | ✅ |

---

## Content / Architects Program (Twitter Threads)

Each build milestone = one thread. No hype, no rockets, no price talk. Arc's amplification guide rules:

1. **"Why freelancers from UA lose $600/year on fees — and what I'm building instead"** → project kickoff
2. **"Deployed first embedded wallet on Arc — here's how it works without a browser wallet"** → technical progress
3. **"Client paid by card, I received USDC in 0.8 seconds — live demo"** → MVP shipped
4. **"Arc vs other networks for a payment product — honest comparison with numbers"** → educational
5. **"$1000 via a traditional provider vs Woosh — real cost breakdown"** → viral potential

Thread style: builder-first, specific numbers, active voice, one emoji max, no financial language.

---

## Architects Program Notes

- Platform: `community.arc.io` (Arc House)
- Points for: reading articles (5pts), forum posts (10pts), guest post (200pts), hackathon participation (200pts), hackathon win (500pts)
- Content guide: `community.arc.io/en/public/resources/arc-engagement-amplification-guide`
- Use "onchain" (not on-chain), avoid "web3", prefer "stablecoin finance" / "programmable dollars"
- Tag: `@arc` not `@ARC` or `@arcnetwork`

---

## Arc Brand Rules (for Twitter content)

**Use:** onchain, stablecoin finance, programmable dollars, Internet Financial System, sub-second finality
**Avoid:** 🚀📈🐂, "alpha", "100x", APR/yield/ROI language, token speculation, "revolutionary", "best", "guaranteed"
**Do:** specific numbers, screenshots, code snippets, demo clips, active voice
**Don't:** tag @arc in the post itself (put it in replies for amplification), add links (hurts reach)

---

## Personal Context

- Builder location: Odesa, Ukraine
- Personal pain point: receiving international payments as a freelancer
- Program: Arc Architects (currently earning points via content reading)
- Goal: ship V1, document the build publicly, grow in Architects tiers
