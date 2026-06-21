# Woosh

> Send a link. Get paid in seconds. No bank required.

USDC payment platform for humans and AI agents. Built on [Arc](https://arc.network), the only chain where USDC is the native gas token, so users never need ETH.

---

## What it does

- **Recipient** signs up with email → gets a Circle embedded wallet and a human-readable payment link (`wooshapp.xyz/pay/yourname`)
- **Sender** opens the link, enters an amount, and pays USDC from any EVM wallet via WalletConnect, or from their own Woosh account
- **Woosh Agent:** natural-language chat in the dashboard: *"send $5 to alex"* → confirmation card → Circle PIN → paid
- **Onboarding guide** for senders who need a wallet or USDC: 3 steps, zero crypto jargon

---

## Shipped (v3.0)

### V1: Web3 Payments
Email sign-in. Circle User-Controlled embedded wallet. Payment link at `/pay/0x...`. Send USDC from any wallet or Woosh account.

### V1.5: Slug Registry
Human-readable payment links stored onchain. `/pay/0x1a2b…` → `/pay/alex`.

- `WooshSlugRegistry` smart contract on Arc, uniqueness enforced onchain
- Voluntary claim from dashboard; live availability check with suggestions

### V2a: Woosh Agent Chat
Claude (via OpenRouter) in the dashboard. Parses intent, executes reads, returns a confirmation card before any send. Tools: `get_balance`, `get_transaction_history`, `send_payment`, `resolve_slug`.

### V2b: Direct Sends from Chat
Payments execute in-place, no redirect. Cached session token → PIN iframe inline. Inline email OTP fallback if token expired. Status bubbles: confirmed → sending → paid.

### V2.2: Payment Requests / Invoices
Create an invoice with a fixed amount and a memo. The request lives onchain in `WooshInvoiceRegistry`, so the share link (`/i/[id]`) carries only the id and nothing in the URL can be tampered with.

- `WooshInvoiceRegistry` smart contract on Arc: `create(salt, amount, memo)` stores the request, `pay(id)` enforces the exact amount and forwards it to the payee, custodies nothing
- "My invoices" list at `/dashboard/invoices`, read straight from the chain via `getInvoiceIds(creator)`, no off-chain bookkeeping
- Create from a dashboard modal or from chat. Agent tools: `create_payment_request` (returns a confirmation card) and `get_invoices` (totals, what's unpaid, what was invoiced)
- Pay flow reuses challenge/execute: `/api/wallet/create-invoice` and `/api/wallet/pay-invoice` → PIN iframe, with inline email OTP fallback

### V3.0: Automated Strategies (recurring payments + DCA)
Set up a recurring USDC payment or a DCA auto-buy that runs onchain on a schedule, no PIN each time after a one-time setup.

- `WooshStrategyRegistry` smart contract on Arc: a vault that custodies the budget and stores the schedule. Payment strategies are fully trustless (the contract forwards to the recipient each period); DCA strategies `releaseForSwap` one period to the executor, which swaps and forwards the output to the owner
- **DCW executor:** a single Developer-Controlled wallet (`entitySecret`, no PIN) triggers due strategies. DCA swaps go through **Circle Swap Kit** with the Circle Wallets adapter, so the same DCW wallet signs the swap, no raw private key. Arc Testnet supports USDC/EURC/cirBTC
- "Strategies" list at `/dashboard/strategies`: create/fund/pause/resume/cancel. Agent tools: `create_strategy` (confirmation card) and `get_strategies`
- Executor runs via Vercel Cron (`/api/cron/execute-strategies`), scheduler-agnostic + idempotent; free Hobby cron = daily granularity

### Stabilization (v2.1)
Stale-closure fix in PaymentForm · Shared Circle SDK singleton · Central session module · Circle token expiry → 401 · Rate limiting on `/api/chat` · Slug resolution in transaction list · Optimistic pending tx entries.

---

## Roadmap

### Coming next: onchain, no external approvals needed

**Multi-token balances:** show EURC and cirBTC alongside USDC in the dashboard.

**One-off swaps (USDC ↔ EURC ↔ cirBTC):** the DCA swap rail (Circle Swap Kit) is in place; expose it as a manual swap from the dashboard and chat (*"swap 50 USDC to EURC"*).

**Gift cards (claim-by-secret):** fund a card, share a link with a secret; recipient claims onchain. Viral by nature: recipient sees Woosh → signs up → now has an account.

**Split-claim links:** first N people get an equal share. Same contract, extended.

**QR for payment requests:** render a scannable QR over an invoice or `/pay/slug?amount=` link.

**Bridge / Unified Balance on PayPage:** Circle App Kit lets senders pay an Arc link with USDC from Base or Ethereum without knowing a bridge exists.

### Later: needs external approval or further hardening

**USYC yield on balance:** deposit idle USDC into USYC (yield-bearing treasury token on Arc). Blocked on Circle allowlist approval.

**Strategy hardening:** per-strategy spend caps / policies, and multiple executor wallets for parallelism (the contract holds one `executor` today).

**Fiat on-ramp / off-ramp:** Transak or Ramp. Needs provider account + onboarding.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript strict |
| Styling | Tailwind CSS |
| Web3 | Wagmi + Viem |
| Wallets (recipients) | Circle User-Controlled Wallets + email OTP |
| Wallets (senders) | WalletConnect + RainbowKit |
| AI | Claude via OpenRouter (`ANTHROPIC_MODEL` env, default `anthropic/claude-3-5-sonnet`) |
| Contracts | Solidity on Arc (Foundry) |
| Chain | Arc Testnet → Mainnet summer 2026 |
| Transaction history | Blockscout v2 API |
| DB | None. Onchain + Blockscout is the source of truth |

---

## Smart contracts (Arc Testnet)

| Contract | Address |
|----------|---------|
| `WooshSlugRegistry` | `NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS` (deploy via Foundry) |
| `WooshInvoiceRegistry` | `NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS` (deploy via Foundry) |
| `WooshStrategyRegistry` | `NEXT_PUBLIC_STRATEGY_REGISTRY_ADDRESS` (deploy via Foundry, then `setExecutor`) |
| USDC (native) | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| cirBTC | `NEXT_PUBLIC_CIRBTC_ADDRESS` (`0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` on testnet) |
| USYC | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` |

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

# WalletConnect, https://cloud.walletconnect.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Circle, https://console.circle.com
CIRCLE_API_KEY=
NEXT_PUBLIC_CIRCLE_APP_ID=

# Smart contracts
NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS=
NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS=
NEXT_PUBLIC_STRATEGY_REGISTRY_ADDRESS=
NEXT_PUBLIC_CIRBTC_ADDRESS=

# Strategies executor (V3.0, server only)
CIRCLE_ENTITY_SECRET=        # DCW entity secret (generate + register in Console)
EXECUTOR_WALLET_ID=          # from POST /api/admin/provision-executor
EXECUTOR_ADDRESS=            # set via WooshStrategyRegistry.setExecutor; fund with USDC for gas
CIRCLE_KIT_KEY=              # Circle Swap Kit key for DCA (KIT_KEY:..., never NEXT_PUBLIC)
CRON_SECRET=                 # secret the cron + admin routes check

# Woosh Agent
OPENROUTER_API_KEY=
ANTHROPIC_MODEL=anthropic/claude-3-5-sonnet
```

### Circle setup

1. [console.circle.com](https://console.circle.com) → create a project
2. Copy **API Key** → `CIRCLE_API_KEY`
3. **Wallets → User Controlled → Configurator** → copy **App ID** → `NEXT_PUBLIC_CIRCLE_APP_ID`
4. Same page → **Authentication Methods → Email OTP** → configure SMTP ([Resend](https://resend.com) recommended)

### Deploy contracts

```bash
forge create contracts/src/WooshSlugRegistry.sol:WooshSlugRegistry \
  --rpc-url https://rpc.testnet.arc.network \
  --private-key $PRIVATE_KEY
# copy deployed address → NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS

forge create contracts/src/WooshInvoiceRegistry.sol:WooshInvoiceRegistry \
  --rpc-url https://rpc.testnet.arc.network \
  --private-key $PRIVATE_KEY
# copy deployed address → NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS

forge create contracts/src/WooshStrategyRegistry.sol:WooshStrategyRegistry \
  --rpc-url https://rpc.testnet.arc.network \
  --private-key $PRIVATE_KEY --broadcast
# copy deployed address → NEXT_PUBLIC_STRATEGY_REGISTRY_ADDRESS
# then: POST /api/admin/provision-executor → set EXECUTOR_* →
#       cast send <addr> "setExecutor(address)" $EXECUTOR_ADDRESS ... → fund executor with USDC
```

---

## Architecture notes

- **No database:** wallet address in URL + onchain registries (slug, invoices) + Blockscout for history
- **UCW, not custodial:** user holds keys encrypted by PIN; Woosh never sees the secret; Circle iframe handles PIN entry
- **Native USDC on Arc:** 18 decimals (not 6); all `parseUnits` / `formatUnits` calls use `18`
- **challenge/execute pattern:** every onchain action (send, pay invoice, register slug) goes: server creates challenge → client `sdk.execute(challengeId)` → PIN iframe → done
- **Agentic loop:** `/api/chat` runs a manual tool-use loop (max 4 iters); `send_payment` and `create_payment_request` always return a `pendingAction`, never auto-execute
- **Every feature integrates with the agent:** new capabilities ship with a chat tool so the agent can guide the user or execute on their behalf
