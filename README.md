# Woosh

> Send a link. Get paid in seconds. No bank required.

USDC payment platform for humans and AI agents. Built on [Arc](https://arc.network) — the only chain where USDC is the native gas token.

---

## What it does

- **Recipient** signs up with email → gets a Circle embedded wallet and a human-readable payment link (`woosh.app/pay/yourname`)
- **Sender** opens the link, enters an amount, and pays USDC — from any EVM wallet via WalletConnect, or from their own Woosh account
- **Woosh Agent** — natural-language chat in the dashboard: "send $5 to alex" → confirmation card → Circle PIN → paid
- **Onboarding guide** for senders who need a wallet or USDC — 3 steps, zero crypto jargon

---

## Shipped

### V1 — Web3 Payments

Email sign-in. Circle User-Controlled embedded wallet. Payment link based on wallet address. Send USDC from any wallet or from another Woosh account. Onboarding guide for new senders.

### V1.5 — Slug Registry

Human-readable payment links stored on-chain. `/pay/0x1a2b…` becomes `/pay/alex`.

- `WooshSlugRegistry` smart contract on Arc — slug → address mapping, uniqueness enforced on-chain
- Voluntary claim from dashboard CTA; `/slug-setup` pre-fills from email with live availability check
- On-chain registration tx signed via Circle UCW SDK (PIN)

### V2a — Woosh Agent Chat

Natural language interface in the dashboard. Claude (via OpenRouter) parses intent, executes reads, and returns a confirmation card before any send.

- Tools: `get_balance`, `get_transaction_history`, `send_payment`
- `send_payment` never auto-executes — server resolves recipient slug, returns `{text, pendingAction}` to frontend
- Confirmation card shows "Send $10.00 to alex (…a3f2)?" before anything moves

### V2b — Direct Sends from Chat

Chat executes payments in place — no redirect to pay page.

- On confirm: cached Circle `userToken` from sessionStorage → `/api/wallet/send-payment` → PIN iframe inline
- Inline email OTP fallback if token expired
- Status bubbles: confirmed → sending → paid (explorer link)

### Stabilization (Phase 0 + Phase 1)

- Stale-closure fix in `PaymentForm` — PIN window always shows current payment
- Shared Circle SDK singleton (`src/shared/lib/w3s.ts`) — no conflicting instances
- Central session module (`src/shared/lib/session.ts`) — complete logout cleanup
- Circle token expiry mapped to 401 so chat OTP fallback fires correctly
- In-memory rate limiting on `/api/chat` (10 req/min per wallet+IP)
- `useSlugMap` — transaction list resolves addresses to `@slug`
- Optimistic pending tx entry after chat send
- Post-signup slug claim prompt

---

## Roadmap

### V2c — Persistence + Agentic Infrastructure (next)

1. **Supabase metadata layer** — chat history, tx memos, payment request rows
2. **Payment requests** — `POST /api/requests` → `/r/[id]` link with locked amount and memo; paid detection via Blockscout polling; chat tool `create_payment_request`
3. **Woosh MCP server** — repackage chat tools as an MCP server so any Claude agent can pay a Woosh link with one config line
4. **Gateway/CCTP on PayPage** — Circle App Kit lets senders pay an Arc link with USDC from Base/Ethereum without knowing a bridge exists

### V3 — Agent Wallets + Fiat

- Developer-Controlled Wallets (DCW) for AI agents — programmatic signing, `POST /api/pay`, spend policies
- Fiat on-ramp via Transak — card → USDC on Arc

### V4 — Recurring Payments

- `WooshSubscription` contract — sender pre-authorizes `maxAmount + period`; recipient pulls each cycle; revocable anytime
- Use cases: SaaS billing, memberships, agent hourly billing
- Off-ramp, EURC support

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Wallets (recipients) | Circle User-Controlled Wallets + email OTP |
| Wallets (senders) | WalletConnect + Wagmi + Viem |
| AI | Claude via OpenRouter (`ANTHROPIC_MODEL` env, default `anthropic/claude-3-5-sonnet`) |
| Contracts | Solidity on Arc (Foundry) |
| Chain | Arc Testnet (chainId 5042002, native USDC, 18 decimals) |
| Transaction history | Blockscout v2 API (arcscan.app) |
| DB | None in V1–V2b (on-chain source of truth); Supabase in V2c |

---

## Smart contracts (Arc Testnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| `WooshSlugRegistry` | set via `NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS` | Slug → address mapping |
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
NEXT_PUBLIC_ARC_FAUCET_URL=https://faucet-testnet.arc.network

# WalletConnect — https://cloud.walletconnect.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Circle — https://console.circle.com
CIRCLE_API_KEY=
NEXT_PUBLIC_CIRCLE_APP_ID=

# Smart contracts
NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS=

# Woosh Agent
OPENROUTER_API_KEY=
ANTHROPIC_MODEL=anthropic/claude-3-5-sonnet
```

### Circle setup

1. [console.circle.com](https://console.circle.com) → create a project
2. Copy **API Key** → `CIRCLE_API_KEY`
3. **Wallets → User Controlled → Configurator** → copy **App ID** → `NEXT_PUBLIC_CIRCLE_APP_ID`
4. Same page → **Authentication Methods → Email OTP** → configure SMTP ([Resend](https://resend.com) recommended)

### Slug registry (deploy once)

```bash
forge create contracts/src/WooshSlugRegistry.sol:WooshSlugRegistry \
  --rpc-url https://rpc.testnet.arc.network \
  --private-key $PRIVATE_KEY
# copy deployed address → NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS
```

---

## Architecture notes

- **No database in V1–V2b** — wallet address in URL + on-chain slug registry + Blockscout for history
- **UCW, not custodial** — user holds their own keys encrypted by their PIN; Woosh never sees the secret; Circle iframe handles PIN entry
- **Native USDC on Arc** — 18 decimals (not 6). All `parseUnits` / `formatUnits` calls use `18`
- **Agentic loop** — `/api/chat` runs a manual tool-use loop (max 4 iters); `send_payment` never auto-executes — always returns a `pendingAction` for the frontend to confirm

## Routes

| Route | Description |
|---|---|
| `/` | Landing page |
| `/signup` | Email registration — creates Circle embedded wallet |
| `/slug-setup` | Voluntary slug registration (V1.5) |
| `/dashboard` | Balance + Woosh Agent chat + last 3 transactions |
| `/dashboard/history` | Full transaction history |
| `/pay/[slug]` | Public payment page — slug resolved via SlugRegistry contract |
