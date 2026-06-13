# Woosh

> Send a link. Get paid in seconds. No bank required.

USDC payment platform for humans and AI agents. Built on [Arc](https://arc.network) — the only chain where USDC is the native gas token, so users never need ETH.

---

## What it does

- **Recipient** signs up with email → gets a Circle embedded wallet and a human-readable payment link (`wooshapp.xyz/pay/yourname`)
- **Sender** opens the link, enters an amount, and pays USDC — from any EVM wallet via WalletConnect, or from their own Woosh account
- **Woosh Agent** — natural-language chat in the dashboard: *"send $5 to alex"* → confirmation card → Circle PIN → paid
- **Onboarding guide** for senders who need a wallet or USDC — 3 steps, zero crypto jargon

---

## Shipped — v2.1

### V1 — Web3 Payments
Email sign-in. Circle User-Controlled embedded wallet. Payment link at `/pay/0x...`. Send USDC from any wallet or Woosh account.

### V1.5 — Slug Registry
Human-readable payment links stored on-chain. `/pay/0x1a2b…` → `/pay/alex`.

- `WooshSlugRegistry` smart contract on Arc — uniqueness enforced on-chain
- Voluntary claim from dashboard; live availability check with suggestions

### V2a — Woosh Agent Chat
Claude (via OpenRouter) in the dashboard. Parses intent, executes reads, returns a confirmation card before any send. Tools: `get_balance`, `get_transaction_history`, `send_payment`, `resolve_slug`.

### V2b — Direct Sends from Chat
Payments execute in-place — no redirect. Cached session token → PIN iframe inline. Inline email OTP fallback if token expired. Status bubbles: confirmed → sending → paid.

### Stabilization (v2.1)
Stale-closure fix in PaymentForm · Shared Circle SDK singleton · Central session module · Circle token expiry → 401 · Rate limiting on `/api/chat` · Slug resolution in transaction list · Optimistic pending tx entries.

---

## Roadmap

### Coming next — on-chain, no external approvals needed

**Multi-token balances** — show EURC and cirBTC alongside USDC in the dashboard.

**Swap USDC ↔ EURC**
- External wallet: Circle App Kit `kit.swap()`
- Woosh account (UCW): StableFX API + `signUserTypedData` challenge — two PIN entries, no bridge needed
- Via chat: *"swap 50 USDC to EURC"* → confirmation card → executed

**Supabase persistence + account portability** — fixes the single-browser limitation; unlocks payment requests, gift cards, chat history.

**Payment requests / invoices** — create a link with a fixed amount and memo; paid detection via Blockscout; share as `/r/[id]`; chat tool `create_payment_request`.

**Gift cards (claim-by-secret)** — fund a card, share a link with a secret; recipient claims on-chain. Viral by nature: recipient sees Woosh → signs up → now has an account.

**Split-claim links** — first N people get an equal share. Same contract, extended.

**Bridge / Unified Balance on PayPage** — Circle App Kit lets senders pay an Arc link with USDC from Base or Ethereum without knowing a bridge exists.

### Later — needs external approval or DCW infrastructure

**USYC yield on balance** — deposit idle USDC into USYC (yield-bearing treasury token on Arc). Blocked on Circle allowlist approval.

**DCW agent wallets + cirBTC swap + recurring payments** — Developer-Controlled Wallets enable programmatic signing. Unlocks: swap into cirBTC (StableFX doesn't support cirBTC for UCW), recurring payments, DCA strategies set up via chat agent. Build the mechanism once, it unlocks all three.

**Fiat on-ramp / off-ramp** — Transak or Ramp. Needs provider account + onboarding.

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
| DB | None in V1–V2b; Supabase in V2c |

---

## Smart contracts (Arc Testnet)

| Contract | Address |
|----------|---------|
| `WooshSlugRegistry` | `NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS` (deploy via Foundry) |
| USDC (native) | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
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

### Deploy slug registry

```bash
forge create contracts/src/WooshSlugRegistry.sol:WooshSlugRegistry \
  --rpc-url https://rpc.testnet.arc.network \
  --private-key $PRIVATE_KEY
# copy deployed address → NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS
```

---

## Architecture notes

- **No database in V1–V2b** — wallet address in URL + on-chain slug registry + Blockscout for history
- **UCW, not custodial** — user holds keys encrypted by PIN; Woosh never sees the secret; Circle iframe handles PIN entry
- **Native USDC on Arc** — 18 decimals (not 6); all `parseUnits` / `formatUnits` calls use `18`
- **challenge/execute pattern** — every on-chain action (send, swap, register slug) goes: server creates challenge → client `sdk.execute(challengeId)` → PIN iframe → done
- **Agentic loop** — `/api/chat` runs a manual tool-use loop (max 4 iters); `send_payment` always returns a `pendingAction` — never auto-executes
- **Every feature integrates with the agent** — new capabilities ship with a chat tool so the agent can guide the user or execute on their behalf
