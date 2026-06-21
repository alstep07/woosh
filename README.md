# Woosh

> Send a link. Get paid in seconds.

USDC payment platform for humans and AI agents. Built on [Arc](https://arc.network), the only chain where USDC is the native gas token — no ETH, no second token, ever.

---

## What it does

- **Wallet:** sign up with email → Circle embedded wallet + human-readable payment link (`woosh.app/pay/yourname`)
- **Transfers:** send and receive USDC by name or link, instant, fees paid in USDC
- **Woosh Agent:** natural-language chat — *"send $25 to @sara"*, *"request $80 from @mike"* → confirmation → paid
- **Invoices:** create an invoice, share the link, get paid in USDC. Stored onchain, nothing in the URL can be tampered with
- **Strategies:** recurring USDC payments and DCA auto-buys (cirBTC, EURC). Set once, runs on schedule, no PIN each time

---

## Shipped (v3.0)

### V1: Email wallet + payment links
Email OTP sign-in. Circle User-Controlled embedded wallet. Payment link at `/pay/0x...`.

### V1.5: Slug registry
Human-readable payment links onchain. `/pay/0x1a2b…` → `/pay/alex`.

- `WooshSlugRegistry` on Arc, uniqueness enforced onchain
- Claim from dashboard; live availability check with suggestions

### V2a/b: Woosh Agent
Claude (via OpenRouter) in the dashboard. Parses intent, executes reads, returns a confirmation card before any send. Direct sends in-place with cached session token and PIN iframe. Inline email OTP fallback.

### V2.2: Invoices
Fixed-amount payment requests stored onchain in `WooshInvoiceRegistry`.

- `create(salt, amount, memo)` stores the request; `pay(id)` enforces the exact amount and forwards to the payee
- Share link `/i/[id]` carries only the id, tamper-proof
- "My invoices" at `/dashboard/invoices`, read from chain, no off-chain bookkeeping
- Create from dashboard modal or chat. Agent tools: `create_payment_request`, `get_invoices`

### V3.0: Strategies (recurring + DCA)
Automated onchain strategies, no PIN after setup.

- `WooshStrategyRegistry` on Arc: custodies the budget, stores the schedule. Recurring payments are fully trustless. DCA strategies release one period to the DCW executor, which swaps via Circle Swap Kit and forwards the output to the owner
- **DCW executor:** Developer-Controlled wallet (`entitySecret`, no PIN) triggers due strategies
- "Strategies" at `/dashboard/strategies`. Agent tools: `create_strategy`, `get_strategies`
- Runs via Vercel Cron (`/api/cron/execute-strategies`), idempotent, daily granularity on free tier

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript strict |
| Styling | Tailwind CSS |
| Web3 | Wagmi + Viem |
| Wallets (users) | Circle User-Controlled Wallets + email OTP |
| Wallets (executor) | Circle Developer-Controlled Wallets |
| Senders (external) | WalletConnect + RainbowKit |
| AI | Claude via OpenRouter (`ANTHROPIC_MODEL` env) |
| Contracts | Solidity on Arc (Foundry) |
| Chain | Arc Testnet (chain 5042002) → Mainnet 2026 |
| History | Blockscout v2 API |
| DB | None. Onchain + Blockscout is the source of truth |

---

## Smart contracts (Arc Testnet)

| Contract | Address |
|----------|---------|
| `WooshSlugRegistry` | `NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS` |
| `WooshInvoiceRegistry` | `NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS` |
| `WooshStrategyRegistry` | `NEXT_PUBLIC_STRATEGY_REGISTRY_ADDRESS` |
| USDC (native) | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| cirBTC | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` (testnet) |

---

## Getting started

```bash
npm install
cp .env.local.example .env.local
# fill in .env.local
npm run dev
```

### Environment variables

```bash
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Arc
NEXT_PUBLIC_ARC_CHAIN_ID=5042002
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_EXPLORER_URL=https://testnet.arcscan.app
NEXT_PUBLIC_ARC_FAUCET_URL=https://faucet.circle.com/

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Circle
CIRCLE_API_KEY=
NEXT_PUBLIC_CIRCLE_APP_ID=

# Smart contracts
NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS=
NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS=
NEXT_PUBLIC_STRATEGY_REGISTRY_ADDRESS=
NEXT_PUBLIC_CIRBTC_ADDRESS=

# Strategies executor (server only)
CIRCLE_ENTITY_SECRET=
EXECUTOR_WALLET_ID=
EXECUTOR_ADDRESS=
CIRCLE_KIT_KEY=
CRON_SECRET=

# Woosh Agent
OPENROUTER_API_KEY=
ANTHROPIC_MODEL=anthropic/claude-3-5-sonnet
```

### Circle setup

1. [console.circle.com](https://console.circle.com) → create a project
2. Copy **API Key** → `CIRCLE_API_KEY`
3. **Wallets → User Controlled → Configurator** → **App ID** → `NEXT_PUBLIC_CIRCLE_APP_ID`
4. **Authentication Methods → Email OTP** → configure SMTP ([Resend](https://resend.com) works well)

### Deploy contracts

```bash
forge create contracts/src/WooshSlugRegistry.sol:WooshSlugRegistry \
  --rpc-url https://rpc.testnet.arc.network --private-key $PRIVATE_KEY

forge create contracts/src/WooshInvoiceRegistry.sol:WooshInvoiceRegistry \
  --rpc-url https://rpc.testnet.arc.network --private-key $PRIVATE_KEY

forge create contracts/src/WooshStrategyRegistry.sol:WooshStrategyRegistry \
  --rpc-url https://rpc.testnet.arc.network --private-key $PRIVATE_KEY
# then: POST /api/admin/provision-executor → set EXECUTOR_* →
#       cast send <addr> "setExecutor(address)" $EXECUTOR_ADDRESS → fund executor with USDC
```

---

## Architecture notes

- **No database:** wallet address + onchain registries + Blockscout for history
- **UCW, not custodial:** user holds keys encrypted by PIN; Woosh never sees the secret
- **Native USDC on Arc:** 18 decimals; all `parseUnits` / `formatUnits` calls use `18`
- **challenge/execute pattern:** every onchain action goes: server creates challenge → client `sdk.execute(challengeId)` → PIN iframe → done
- **Agentic loop:** `/api/chat` runs a manual tool-use loop (max 4 iters); `send_payment` and `create_payment_request` always return a `pendingAction`, never auto-execute
- **Every feature ships with a chat tool** so the agent can guide the user or execute on their behalf
