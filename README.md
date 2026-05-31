# Woosh

Send a payment link. Get paid in seconds. No bank required.

> Built on [Arc](https://arc.network) — the only chain where USDC is the native gas token.

## What it does

- **Recipient** signs up with email → gets a Circle embedded wallet and a personal payment link (`woosh.app/pay/0x...`)
- **Sender** opens the link, connects any EVM wallet (via RainbowKit), and pays USDC on Arc testnet
- **Woosh pay** — senders without a wallet can pay directly from their Woosh account via email OTP
- **Onboarding guide** for senders who need a wallet or USDC — 3 steps, no crypto jargon

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Wallets (recipients) | Circle User-Controlled Wallets + email OTP |
| Wallets (senders) | RainbowKit + Wagmi + Viem |
| Chain | Arc testnet (chainId 5042002, native USDC, 18 decimals) |
| Transaction history | Blockscout v2 API (arcscan.app) |
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
# App
NEXT_PUBLIC_BASE_URL=http://localhost:3000   # change to your domain in production

# Arc Network
NEXT_PUBLIC_ARC_CHAIN_ID=5042002
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_EXPLORER_URL=https://testnet.arcscan.app
NEXT_PUBLIC_ARC_FAUCET_URL=https://faucet.testnet.arc.network/api/claim

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
| `/dashboard` | Balance, transaction history, copy payment link |
| `/pay/[address]` | Public payment page — address-based, no database needed |

## Architecture notes

- **Stateless** — no database in V1. The wallet address is embedded directly in the payment URL (`/pay/0x...`), so payment links work without any server-side user mapping.
- **Transaction history** — fetched from Blockscout v2 API server-side (no RPC block scanning, no rate limits).
- **Native USDC** — Arc uses USDC as the gas token with 18 decimals (not 6). All `parseUnits` / `formatUnits` calls use `18`.

## Roadmap

- **V1** (now) — crypto-to-crypto, Arc testnet
- **V2** — fiat on-ramp via Transak, Supabase for payment metadata
- **V3** — yield on idle USDC (Aave / USYC)
