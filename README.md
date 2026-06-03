# Woosh

> Send a link. Get paid in seconds. No bank required.

USDC payment platform for humans and AI agents. Built on [Arc](https://arc.network) — the only chain where USDC is the native gas token.

---

## What it does

- **Recipient** signs up with email → gets a Circle embedded wallet and a personal payment link (`woosh.app/pay/yourname`)
- **Sender** opens the link, connects any EVM wallet via WalletConnect, and pays USDC on Arc
- **Woosh pay** — senders with a Woosh account pay directly via email OTP, no external wallet needed
- **Onboarding guide** for senders who need a wallet or USDC — 3 steps, no crypto jargon

---

## Roadmap

### V1 — Web3 Payments (live)

Email sign-in. Circle User-Controlled embedded wallet. Payment link based on wallet address. Send USDC from any wallet or from another Woosh account.

### V1.5 — Slug Registry (next)

Human-readable payment links stored on-chain. `/pay/0x1a2b…` becomes `/pay/alex`.

- `WooshSlugRegistry` smart contract on Arc — slug → address mapping, uniqueness enforced on-chain
- After login, if no slug → `/slug-setup` flow with pre-fill from email and live availability check
- Single on-chain registration tx via Circle UCW SDK

### V2 — Agentic Payments + Payment Requests

**Payment Requests** — on-chain invoices via `WooshPaymentRequest` contract:
- Fixed amount, description, optional expiry
- Share as `/pay/alex?req=0xABC` — amount locked, marked paid on-chain after settlement
- Use cases: freelance invoices, event tickets, one-time fees

**Agentic Payments** — Woosh as infrastructure for AI agents:
- ERC-8183 escrow on Arc: `createJob → fund → submit → complete/reject`
- `POST /api/pay` endpoint (Bearer token), webhooks on confirmation
- Agent wallets via Circle Developer-Controlled Wallets (DCW)

### V3 — Recurring Payments + Streams

- `WooshSubscription` — sender pre-authorizes max amount + period, recipient pulls each cycle. Revocable anytime.
- Payment streams — USDC per-second, recipient withdraws accumulated balance at any time
- Use cases: SaaS billing, memberships, salary, agent hourly billing

### V4 — Web2 Integrations + Advanced Contracts

- Fiat on-ramp via Transak — pay by card, USDC lands on Arc
- CCTP bridge — bring USDC from Base or Ethereum
- Payment splits — one payment divided across multiple recipients
- Vouchers — USDC gift card redeemable by code
- Milestone escrow — multi-step release for projects

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Wallets (recipients) | Circle User-Controlled Wallets + email OTP |
| Wallets (senders) | WalletConnect + Wagmi + Viem |
| Contracts | Solidity on Arc |
| Chain | Arc Testnet (chainId 5042002, native USDC, 18 decimals) |
| Transaction history | Blockscout v2 API (arcscan.app) |

---

## Smart contracts (Arc Testnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| `WooshSlugRegistry` | TBD | Slug → address mapping |
| `WooshPaymentRequest` | TBD | On-chain invoices |
| ERC-8183 | `0x0747EEf0706327138c69792bF28Cd525089e4583` | Agentic job escrow |
| USDC | `0x3600000000000000000000000000000000000000` | Native stablecoin |

---

## Getting started

```bash
npm install
cp .env.local.example .env.local
# fill in .env.local
npm run dev
```

## Environment variables

```bash
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Arc
NEXT_PUBLIC_ARC_CHAIN_ID=5042002
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_EXPLORER_URL=https://testnet.arcscan.app
NEXT_PUBLIC_ARC_FAUCET_URL=https://faucet.testnet.arc.network/api/claim

# WalletConnect — https://cloud.walletconnect.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Circle — https://console.circle.com
CIRCLE_API_KEY=
NEXT_PUBLIC_CIRCLE_APP_ID=

# Smart contracts (V1.5+)
NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS=
```

### Circle setup

1. [console.circle.com](https://console.circle.com) → create a project
2. Copy **API Key** → `CIRCLE_API_KEY`
3. **Wallets → User Controlled → Configurator** → copy **App ID** → `NEXT_PUBLIC_CIRCLE_APP_ID`
4. Same page → **Authentication Methods → Email OTP** → configure SMTP ([Resend](https://resend.com) recommended)

---

## Architecture notes

- **Stateless V1** — no database. Wallet address embedded in the payment URL, no server-side user mapping needed.
- **V1.5+** — slugs stored on-chain in `WooshSlugRegistry`. No off-chain DB still required — contract is the source of truth.
- **Transaction history** — fetched from Blockscout v2 API server-side (no RPC block scanning).
- **Native USDC on Arc** — 18 decimals (not 6). All `parseUnits` / `formatUnits` calls use `18`.

## Routes

| Route | Description |
|---|---|
| `/` | Landing page |
| `/signup` | Email registration — creates Circle embedded wallet |
| `/slug-setup` | One-time slug registration after first login (V1.5) |
| `/dashboard` | Balance, transaction history, copy payment link |
| `/pay/[slug]` | Public payment page — resolved via SlugRegistry contract |
