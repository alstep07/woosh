## Why

Anyone expecting payment loses money on bank fees, poor local coverage, and frozen accounts. Woosh V1 removes friction on both sides: recipients register once and share a payment link, senders pay USDC directly from any wallet — no bank, no gas token, no seed phrases required.

## What Changes

- New Next.js 14 app (App Router) bootstrapped from scratch
- **New**: `/` landing page explaining the value prop to both recipient and sender audiences
- **New**: `/signup` — email-based registration that triggers Circle Programmable Wallets to create an embedded wallet and assign a payment slug
- **New**: `/dashboard` — authenticated view showing USDC balance, transaction history (read from Arc via Viem), and shareable payment link
- **New**: `/pay/[slug]` — public payment page where any sender connects their external wallet (Wagmi) and sends USDC on Arc testnet
- **New**: Onboarding guide overlay on `/pay/[slug]` — 3-step flow for senders who have no wallet or no USDC (create account → get testnet USDC via faucet → return and pay)

## Capabilities

### New Capabilities
- `landing-page`: Marketing page at `/` that communicates the product value prop and drives signups
- `user-auth`: Email-based registration at `/signup` that creates a Circle embedded wallet and a unique payment slug for the recipient
- `dashboard`: Authenticated view at `/dashboard` showing USDC balance, on-chain transaction history, and the recipient's shareable payment link
- `payment-page`: Public page at `/pay/[slug]` where external-wallet senders connect and pay USDC on Arc testnet
- `onboarding-guide`: 3-step guide overlay on `/pay/[slug]` for senders without a wallet or USDC — covers account creation, Arc testnet faucet, and return-to-pay

### Modified Capabilities
<!-- none — greenfield project -->

## Impact

- New project: no existing code is modified
- External dependencies: Circle Programmable Wallets SDK, Wagmi, Viem, Arc testnet RPC
- On-chain reads: `useTransactionHistory` hook using Viem against Arc testnet; no database for V1
- Auth state: session managed client-side via Circle SDK; no separate auth service for V1
- Supabase: dependency added to project now but not used until V2 (user profile / payment metadata)
