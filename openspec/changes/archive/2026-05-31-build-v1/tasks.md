## 1. Project Bootstrap

- [x] 1.1 Initialize Next.js 14 App Router project with TypeScript and Tailwind CSS
- [x] 1.2 Install dependencies: wagmi, viem, @circle-fin/user-controlled-wallets (or w3s-web sdk), @tanstack/react-query
- [x] 1.3 Configure Arc testnet chain in Viem/Wagmi (chainId, RPC URL, USDC contract address)
- [x] 1.4 Set up Tailwind theme with Woosh design tokens (colors, fonts, border radius)
- [x] 1.5 Create shared layout with Inter font and `#0A0F1E` background

## 2. Circle SDK Integration

- [x] 2.1 Install `@circle-fin/user-controlled-wallets` (server SDK) and `@circle-fin/w3s-pw-web-sdk` (client SDK); configure with `CIRCLE_API_KEY` and `NEXT_PUBLIC_CIRCLE_APP_ID` (no `CIRCLE_WALLET_SET_ID` — UCW does not use wallet sets)
- [x] 2.2 Implement UCW server functions in `lib/circle.ts`: `requestOtp(deviceId, email)`, `initializeUser(userToken)` (calls `createUserPinWithWallets` on ARC-TESTNET EOA), `getUserWallets(userToken)`; wire into API routes `/api/wallet/request-otp`, `/api/wallet/initialize`, `/api/wallet/complete`
- [x] 2.3 Implement slug-to-walletAddress lookup via in-memory module-level Map in `lib/store.ts` (persists across hot reloads via `globalThis`; replaced by Supabase in V2)
- [x] 2.4 Add slug uniqueness check and auto-suffix logic (e.g., "alice" → "alice1" on collision)

## 3. Wagmi Provider Setup

- [x] 3.1 Create `WagmiProvider` wrapper in `app/layout.tsx` (or a dedicated provider file) with Arc testnet config
- [x] 3.2 Configure connectors: MetaMask, Coinbase Wallet, WalletConnect
- [x] 3.3 Wrap app in `QueryClientProvider` for Wagmi's React Query dependency

## 4. Landing Page (`/`)

- [x] 4.1 Build hero section with headline, subheadline, and "Get your payment link" CTA → `/signup`
- [x] 4.2 Build "How it works" section with recipient steps and sender steps
- [x] 4.3 Ensure zero crypto jargon in all copy (no "blockchain", "gas", "seed phrase", etc.)
- [x] 4.4 Verify mobile-first layout renders correctly at 375px viewport

## 5. Signup Page (`/signup`)

- [x] 5.1 Build 3-step signup UI: email input (step 1) → OTP verify prompt (step 2) → "Setting up your wallet…" (step 3); initialize `W3SSdk` with login callback on mount; disable send button until `sdk.getDeviceId()` resolves
- [x] 5.2 Wire step 1 to `POST /api/wallet/request-otp`; on success update SDK config and advance to step 2; wire step 2 "Enter verification code" button to `sdk.verifyOtp()`; on login callback success auto-call `POST /api/wallet/initialize` then `sdk.execute(challengeId)` then `POST /api/wallet/complete`
- [x] 5.3 Handle re-registration gracefully — if `POST /api/wallet/initialize` returns `{alreadyExists: true}`, skip challenge and call `POST /api/wallet/complete` directly; no duplicate-email error shown
- [x] 5.4 On `POST /api/wallet/complete` success, store `{email, slug, walletAddress}` in localStorage under key `woosh_session` and redirect to `/dashboard`
- [x] 5.5 Display loading state during wallet creation

## 6. Dashboard Page (`/dashboard`)

- [x] 6.1 Add authentication guard — redirect unauthenticated users to `/signup`
- [x] 6.2 Implement `useUSDCBalance(address)` hook using Viem public client to read USDC balance on Arc
- [x] 6.3 Display USDC balance formatted as USD (e.g., "$120.50"); show "Balance unavailable" on fetch error
- [x] 6.4 Implement `useTransactionHistory(address)` hook fetching incoming USDC transfers from Arc via Viem event logs
- [x] 6.5 Render transaction list: truncated sender address, USDC amount, relative timestamp
- [x] 6.6 Render empty state when no transactions exist
- [x] 6.7 Display payment link `woosh.app/pay/<slug>` with one-click copy and clipboard confirmation toast

## 7. Payment Page (`/pay/[slug]`)

- [x] 7.1 Implement slug → walletAddress resolution in a server component or API route; return 404 for unknown slugs
- [x] 7.2 Build amount entry field with validation (positive number, disables pay button on invalid input)
- [x] 7.3 Integrate Wagmi wallet connection button (connect modal with available connectors)
- [x] 7.4 Show connected wallet address after connection; display "Switch to Arc testnet" banner on wrong network
- [x] 7.5 Implement `useUSDCBalance` check for sender's connected wallet; show insufficient-balance banner when balance < amount
- [x] 7.6 Implement USDC `transfer(recipient, amount)` call via Wagmi `useWriteContract` or `useSendTransaction`
- [x] 7.7 Handle wallet-rejected transaction — return to form without error
- [x] 7.8 Handle on-chain failure — display error with retry option
- [x] 7.9 Show success screen with transaction hash and confirmation message after successful payment

## 8. Onboarding Guide

- [x] 8.1 Build dismissible overlay component (closes on X click or Escape key; preserves payment form state)
- [x] 8.2 Step 1: display "Create a Woosh account" content with CTA → `/signup`
- [x] 8.3 Step 2: display "Get testnet USDC" with one-click faucet request; prompt wallet connection if not yet connected
- [x] 8.4 Implement Arc testnet faucet call for the sender's connected wallet address
- [x] 8.5 Step 3: display "You're ready to pay" confirmation with CTA that dismisses guide and returns to payment form
- [x] 8.6 Wire "I don't know where to start" link on payment page to open guide at Step 1
- [x] 8.7 Wire insufficient-balance banner "Here's how to get some →" to open guide at Step 2
- [x] 8.8 Verify guide shows no wallet selection menu — single linear path only

## 9. Polish & QA

- [x] 9.1 Verify all pages are mobile-first and render correctly at 375px
- [x] 9.2 Audit all visible copy for crypto jargon and replace with plain language
- [x] 9.3 Add loading skeletons or spinners for async data (balance, transaction history)
- [x] 9.4 Test end-to-end happy path: signup → dashboard → share link → pay from external wallet
- [x] 9.5 Test onboarding guide flow: trigger → Step 1 → Step 2 (faucet) → Step 3 → pay
- [x] 9.6 Test error states: unknown slug, insufficient balance, wrong network, failed transaction
