## Context

Woosh V1 is a greenfield Next.js 14 App Router application. There is no existing codebase to migrate. The product targets two personas: recipients who want to receive USDC without a bank, and senders who pay via any EVM wallet. The chain is Arc testnet — an EVM chain where USDC is the native gas token, eliminating the need for ETH entirely.

## Goals / Non-Goals

**Goals:**
- Working end-to-end payment flow: email signup → embedded wallet → payment link → sender pays USDC
- Circle User-Controlled Wallets for recipient-side key ownership (no seed phrases, no MetaMask required for recipients)
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

### 1. Circle User-Controlled Wallets (UCW) for recipient wallet creation
**Decision**: Use Circle's User-Controlled Wallets SDK (`@circle-fin/user-controlled-wallets` server-side, `@circle-fin/w3s-pw-web-sdk` client-side) with email OTP authentication. Recipients create their own wallet via a 3-step OTP flow on `/signup`. Woosh is not a custodian — users hold their own keys.

**Why**: Recipients in emerging markets should never see a seed phrase or install MetaMask. UCW achieves this while keeping users in control of their funds. Developer-Controlled Wallets (DCW) were considered but rejected: DCW requires an Entity Secret (complex RSA setup) and makes Woosh the custodian. UCW requires only a Circle App ID and no server-side key material.

**Alternatives considered**: DCW (rejected — custody liability, Entity Secret complexity), EOA with MetaMask (too much friction), Privy (additional vendor, higher cost at MVP scale).

### 2. UCW 3-step signup flow and API route structure
**Decision**: Signup is split across three API routes and a client-side SDK:
- `POST /api/wallet/request-otp` — sends OTP via Circle, returns SDK config tokens (`deviceToken`, `deviceEncryptionKey`, `otpToken`)
- `POST /api/wallet/initialize` — calls `createUserPinWithWallets()` on Arc testnet (EOA), returns `challengeId` or `{alreadyExists: true}` on error 155106
- `POST /api/wallet/complete` — called after SDK executes the challenge; fetches wallet via `listWallets()`, assigns slug, saves user record

The client uses `W3SSdk` to (a) verify OTP in Circle's hosted iframe and (b) execute the wallet creation challenge.

**Why**: UCW wallet creation requires user-side key generation, which happens in Circle's hosted SDK iframe. The three routes cleanly separate the concerns of authentication, challenge creation, and post-creation registration. Each route is stateless and independently testable.

**Alternatives considered**: Single-step server-side creation — impossible with UCW; the user must authorize the challenge client-side.

### 3. On-chain transaction history via block scanning, no database in V1
**Decision**: Transaction history in `/dashboard` is read by scanning the last 200 blocks from Arc using `arcPublicClient.getBlock({ blockNumber, includeTransactions: true })` and filtering for transactions where `tx.to === recipientAddress && tx.value > 0`. USDC balance is read via `arcPublicClient.getBalance(address)`. No Supabase writes in V1. No ERC20 contract — USDC is Arc's native token.

**Why**: Keeps V1 simple with zero backend state. Arc finality is sub-second so reads are near-real-time. Supabase is added in V2 when we need to store sender names and payment descriptions. Event log filtering on a USDC ERC20 contract does not apply because USDC is native on Arc.

**Trade-off**: Block scan is limited to 200 blocks to avoid RPC range limits. Very old transactions may not appear. Acceptable for V1 testnet, solved with Supabase in V2.

### 4. In-memory module-level Map for slug store
**Decision**: `lib/store.ts` maintains a `globalThis`-backed `Map<slug, UserRecord>` that persists across Next.js hot reloads in dev. Data is lost on server restart. Circle wallet user metadata is not used for slug storage.

**Why**: V1 scope defers Supabase to V2. A module-level Map requires zero infrastructure, works for testnet demo, and is trivially replaceable with a Supabase table in V2. Circle's user metadata API adds a round-trip on every slug lookup without benefit at V1 scale.

**Trade-off**: Server restart clears all registrations. Acceptable for testnet-only V1.

### 5. App Router with server components for public pages, client components for wallet interactions
**Decision**: `/` and `/pay/[slug]` page shells are server components. Wallet connection (Wagmi), Circle SDK calls, and balance reads are wrapped in `"use client"` components.

**Why**: Best-practice for Next.js 14 App Router. Server components reduce JS bundle on public pages. Client components are co-located with the wallet state they own.

### 6. Single onboarding path — no wallet choice menu
**Decision**: The onboarding guide always directs senders through one path: create a Woosh account (embedded wallet), get testnet USDC via Arc faucet, return and pay. No alternatives shown.

**Why**: Showing MetaMask vs Coinbase vs WalletConnect at onboarding causes decision paralysis for non-crypto users. The embedded wallet path is the simplest. Users who already have a wallet dismiss the guide and connect directly.

## Risks / Trade-offs

- **UCW challenge UX** → Circle's hosted iframe may show a PIN or security question prompt during wallet creation (in addition to OTP). This is Circle-controlled and cannot be removed without Circle's involvement. Mitigation: inform users the modal is part of the setup process.
- **Arc testnet RPC instability** → Mitigation: wrap Viem client calls with retry logic; show friendly error states rather than blank UI.
- **Slug uniqueness collisions** → Mitigation: enforce uniqueness check at signup; suggest alternatives if slug is taken.
- **No server-side auth in V1** → Mitigation: dashboard only shows data for the localStorage session; no sensitive server routes. Acceptable for testnet scope.
- **Transaction history completeness** → Block scan limited to last 200 blocks; very old transactions won't appear. Acceptable for V1 testnet, solved with Supabase in V2.
