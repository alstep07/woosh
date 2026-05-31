## Context

Woosh V1 is a greenfield Next.js 14 App Router application. There is no existing codebase to migrate. The product targets two personas: freelancers in emerging markets (recipients) who want to receive USDC without a bank, and their clients (senders) who pay via any EVM wallet. The chain is Arc testnet — an EVM chain where USDC is the native gas token, eliminating the need for ETH entirely.

## Goals / Non-Goals

**Goals:**
- Working end-to-end payment flow: email signup → embedded wallet → payment link → sender pays USDC
- Circle Programmable Wallets for recipient-side custody (no seed phrases, no MetaMask required for recipients)
- Wagmi + Viem for sender-side wallet connections and on-chain reads
- Onboarding guide for senders without a wallet or USDC
- All pages mobile-first and consistent with the Woosh visual system

**Non-Goals:**
- Fiat on-ramp (Transak — V2)
- Yield on idle balance (Aave / USYC — V3)
- Supabase data persistence (V2 — only dependency scaffolded)
- Off-ramp to local bank or card
- Invoice export, recurring payments, multi-recipient payroll

## Decisions

### 1. Circle Programmable Wallets for recipient custody
**Decision**: Use Circle's Embedded Wallets SDK to create wallets server-side on signup. The wallet address is stored alongside the user's email and slug.

**Why**: Recipients in emerging markets should never see a seed phrase or install MetaMask. Circle handles custody. Arc supports Circle-native USDC, so there is no wrapping or bridging for the recipient side.

**Alternatives considered**: EOA with MetaMask (too much friction), Privy (additional vendor, higher cost at MVP scale).

### 2. Wagmi + Viem for sender wallet connections
**Decision**: Senders connect their own external wallets (MetaMask, Coinbase Wallet, WalletConnect) via Wagmi on the `/pay/[slug]` page. Viem handles the `sendTransaction` call and on-chain reads.

**Why**: Senders are likely existing crypto users. Wagmi is the standard Next.js + TypeScript web3 library. Arc is EVM-compatible, so no custom connector is needed beyond configuring the Arc testnet chain.

**Alternatives considered**: Ethers.js (less typed, no React hooks), building custom connector (unnecessary given EVM compatibility).

### 3. On-chain transaction history, no database in V1
**Decision**: Transaction history in `/dashboard` is read directly from Arc via a Viem public client using `getTransactionReceipt`-style queries or event log filtering on the USDC contract. No Supabase writes in V1.

**Why**: Keeps V1 simple with zero backend state. Arc finality is sub-second so reads are near-real-time. Supabase is added in V2 when we need to store sender names / payment descriptions.

**Trade-off**: No payment metadata (who paid, what for). Transactions show as addresses only in V1.

### 4. Payment slug stored in Circle wallet user data or env-backed mock store
**Decision**: In V1, the mapping of `slug → walletAddress` is stored in a lightweight server-side store (environment-variable-backed JSON or Supabase row). Circle wallet user metadata will hold the slug.

**Why**: We need slug lookup on every `/pay/[slug]` visit. Circle's user metadata field handles this without a separate database for V1.

### 5. App Router with server components for public pages, client components for wallet interactions
**Decision**: `/` and `/pay/[slug]` page shells are server components. Wallet connection (Wagmi), Circle SDK calls, and balance reads are wrapped in `"use client"` components.

**Why**: Best-practice for Next.js 14 App Router. Server components reduce JS bundle on public pages. Client components are co-located with the wallet state they own.

### 6. Single onboarding path — no wallet choice menu
**Decision**: The onboarding guide always directs senders through one path: create a Woosh account (embedded wallet), get testnet USDC via Arc faucet, return and pay. No alternatives shown.

**Why**: Showing MetaMask vs Coinbase vs WalletConnect at onboarding causes decision paralysis for non-crypto users. The embedded wallet path is the simplest. Users who already have a wallet dismiss the guide and connect directly.

## Risks / Trade-offs

- **Circle SDK maturity on Arc testnet** → Mitigation: validate wallet creation flow in isolation before wiring into signup; keep a mock fallback for local dev.
- **Arc testnet RPC instability** → Mitigation: wrap Viem client calls with retry logic; show friendly error states rather than blank UI.
- **Slug uniqueness collisions** → Mitigation: enforce uniqueness check at signup; suggest alternatives if slug is taken.
- **No server-side auth in V1** → Mitigation: dashboard only shows data for the connected Circle session; no sensitive server routes. Acceptable for testnet scope.
- **Transaction history completeness** → On-chain read via Viem has block range limits on some RPCs; may miss very old txns. Acceptable for V1 testnet, solved with Supabase in V2.
