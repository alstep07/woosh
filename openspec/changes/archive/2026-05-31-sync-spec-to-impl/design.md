## Context

The build-v1 design doc was written speculatively before implementation. The actual build deviated in one major area: Circle wallet type. The original design chose Developer-Controlled Wallets (DCW), which requires an Entity Secret, server-side key custody, and a Wallet Set ID. During implementation, DCW was replaced with User-Controlled Wallets (UCW) with email OTP because: the DCW Entity Secret setup is complex, and Woosh should not be a custodian of user funds. UCW gives users non-custodial ownership while keeping the "email only, no seed phrase" UX intact.

This design doc describes the spec sync task — updating documentation to reflect what was built — not new product code.

## Goals / Non-Goals

**Goals:**
- Accurately document the UCW email OTP signup architecture
- Correct API route structure (`/api/wallet/*` instead of `/api/signup`)
- Correct transaction history method (block scanning, not ERC20 event logs)
- Correct in-memory store design (module-level Map, not Circle metadata)
- Mark build-v1 tasks accurately

**Non-Goals:**
- Any code changes
- Changing any product requirements beyond what implementation settled
- Documenting V2+ features

## Decisions

### 1. UCW (User-Controlled Wallets) instead of DCW (Developer-Controlled Wallets)
**Decision**: Circle User-Controlled Wallets with email OTP, using `@circle-fin/user-controlled-wallets` (server) and `@circle-fin/w3s-pw-web-sdk` (client).

**Why**: DCW requires an Entity Secret (RSA-encrypted, complex setup) and makes Woosh the custodian of user funds. UCW requires only a Circle App ID, and users hold their own keys — more aligned with the product's non-custodial ethos.

**Alternatives considered**: DCW (rejected — custody, complexity), Modular Wallets/passkeys (rejected — passkeys UX unfamiliar to emerging market users).

### 2. Three-step signup flow
**Decision**: Signup is split into three server/SDK interactions: (1) request OTP via `/api/wallet/request-otp`, (2) verify OTP in Circle's hosted iframe via W3SSdk, (3) execute wallet creation challenge.

**Why**: UCW requires user-side key generation, which happens client-side in Circle's SDK. The OTP step authenticates the user; the challenge step authorizes wallet creation. These cannot be collapsed into a single server call.

**Alternatives considered**: Single-step server-side wallet creation — impossible with UCW (user must authorize challenge).

### 3. `/api/wallet/*` route structure
**Decision**: Three separate API routes: `request-otp`, `initialize`, `complete`.
- `request-otp` — sends OTP, returns SDK config tokens
- `initialize` — creates wallet challenge (returns `challengeId` or `alreadyExists`)
- `complete` — called after SDK executes challenge; fetches wallet address, assigns slug, saves user

**Why**: Each step has a distinct contract with the client. Separating them makes each route stateless and testable independently. Aligns with the API design principle of stateless, agent-ready routes.

### 4. Native USDC balance reads (not ERC20 event logs)
**Decision**: `useUSDCBalance` uses `arcPublicClient.getBalance(address)` (native balance). `useTransactionHistory` scans last 200 blocks with `includeTransactions: true`, filtering by `tx.to === recipientAddress && tx.value > 0`.

**Why**: On Arc, USDC is the native token (not an ERC20). There is no USDC contract address to query. Native balance and transaction reads are simpler and more reliable.

**Alternatives considered**: ERC20 `Transfer` event log filtering — does not apply since USDC is native on Arc.

### 5. In-memory store (module-level Map)
**Decision**: `lib/store.ts` uses a `globalThis`-backed Map to persist slug→user mappings across Next.js hot reloads in dev. Data is lost on server restart.

**Why**: V1 scope explicitly defers Supabase to V2. The Map approach requires zero infrastructure, works for testnet demo, and is trivially replaceable.

**Trade-off**: Any server restart clears all user registrations. Acceptable for testnet-only V1.

## Risks / Trade-offs

- **Spec divergence accumulates** → Mitigated by this sync change; future changes should update spec alongside code
- **UCW challenge UX** → Circle's hosted iframe may show PIN setup prompt in addition to OTP; this is Circle-controlled and not adjustable without contacting Circle support
- **Block scan range limits** → Last 200 blocks may miss old transactions on testnet; acceptable for V1, solved by Supabase in V2
