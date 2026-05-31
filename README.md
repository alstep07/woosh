# Woosh

Send a payment link. Get paid in seconds. No bank required.

> Built on [Arc](https://arc.network) — the only chain where USDC is the native gas token.

## What it does

- **Recipient** signs up with email → gets an embedded wallet and a personal payment link (`woosh.app/pay/username`)
- **Sender** opens the link, connects any EVM wallet, and sends USDC on Arc testnet
- **Onboarding guide** for senders who need a wallet or USDC — 3-step, no crypto jargon

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Wallets (recipients) | Circle User-Controlled Wallets + email OTP |
| Wallets (senders) | Wagmi + Viem (Injected, Coinbase, WalletConnect) |
| Chain | Arc testnet (chainId 3693, native USDC) |
| Styling | Tailwind CSS |

## Getting started

```bash
yarn install
cp .env.local.example .env.local
# fill in .env.local (see below)
yarn dev
```

## Environment variables

```bash
# Arc Network (defaults work for testnet)
NEXT_PUBLIC_ARC_CHAIN_ID=3693
NEXT_PUBLIC_ARC_RPC_URL=https://rpc-testnet.arc.network
NEXT_PUBLIC_ARC_EXPLORER_URL=https://explorer-testnet.arc.network
NEXT_PUBLIC_ARC_FAUCET_URL=https://faucet-testnet.arc.network/api/claim

# WalletConnect — https://cloud.walletconnect.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Circle — https://console.circle.com
CIRCLE_API_KEY=                   # Project Settings → API Keys
NEXT_PUBLIC_CIRCLE_APP_ID=        # Wallets → User Controlled → Configurator
```

### Circle setup (required)

1. [console.circle.com](https://console.circle.com) → create a project
2. Copy **API Key** → `CIRCLE_API_KEY`
3. **Wallets → User Controlled → Configurator** → copy **App ID** → `NEXT_PUBLIC_CIRCLE_APP_ID`
4. Same page → **Authentication Methods → Email OTP** → configure SMTP ([Resend](https://resend.com) recommended)

## Routes

| Route | Description |
|---|---|
| `/` | Landing page |
| `/signup` | Email registration — creates Circle embedded wallet |
| `/dashboard` | Balance, transaction history, payment link |
| `/pay/[slug]` | Public payment page for senders |

## Roadmap

- **V1** (now) — crypto-to-crypto, Arc testnet
- **V2** — agentic payments API (REST + webhooks for AI agents), Supabase for payment metadata
- **V3** — yield on idle USDC (Aave / USYC)
- **V4** — fiat on-ramp via Transak
