## 1. Project Bootstrap

- [ ] 1.1 Initialize Next.js 14 App Router project with TypeScript and Tailwind CSS
- [ ] 1.2 Install dependencies: wagmi, viem, @circle-fin/user-controlled-wallets (or w3s-web sdk), @tanstack/react-query
- [ ] 1.3 Configure Arc testnet chain in Viem/Wagmi (chainId, RPC URL, USDC contract address)
- [ ] 1.4 Set up Tailwind theme with Woosh design tokens (colors, fonts, border radius)
- [ ] 1.5 Create shared layout with Inter font and `#0A0F1E` background

## 2. Circle SDK Integration

- [ ] 2.1 Configure Circle Programmable Wallets SDK with API key from environment
- [ ] 2.2 Implement `createEmbeddedWallet(email)` server action that calls Circle API and returns walletId + walletAddress
- [ ] 2.3 Implement slug-to-walletAddress lookup (store in Circle user metadata or a local JSON/env store)
- [ ] 2.4 Add slug uniqueness check and auto-suffix logic (e.g., "alice" → "alice1" on collision)

## 3. Wagmi Provider Setup

- [ ] 3.1 Create `WagmiProvider` wrapper in `app/layout.tsx` (or a dedicated provider file) with Arc testnet config
- [ ] 3.2 Configure connectors: MetaMask, Coinbase Wallet, WalletConnect
- [ ] 3.3 Wrap app in `QueryClientProvider` for Wagmi's React Query dependency

## 4. Landing Page (`/`)

- [ ] 4.1 Build hero section with headline, subheadline, and "Get your payment link" CTA → `/signup`
- [ ] 4.2 Build "How it works" section with recipient steps and sender steps
- [ ] 4.3 Ensure zero crypto jargon in all copy (no "blockchain", "gas", "seed phrase", etc.)
- [ ] 4.4 Verify mobile-first layout renders correctly at 375px viewport

## 5. Signup Page (`/signup`)

- [ ] 5.1 Build email input form with client-side validation (required field, valid email format)
- [ ] 5.2 Wire form submission to `createEmbeddedWallet` server action
- [ ] 5.3 Handle duplicate email error — display inline error message
- [ ] 5.4 On success, store session (Circle session token or equivalent) and redirect to `/dashboard`
- [ ] 5.5 Display loading state during wallet creation

## 6. Dashboard Page (`/dashboard`)

- [ ] 6.1 Add authentication guard — redirect unauthenticated users to `/signup`
- [ ] 6.2 Implement `useUSDCBalance(address)` hook using Viem public client to read USDC balance on Arc
- [ ] 6.3 Display USDC balance formatted as USD (e.g., "$120.50"); show "Balance unavailable" on fetch error
- [ ] 6.4 Implement `useTransactionHistory(address)` hook fetching incoming USDC transfers from Arc via Viem event logs
- [ ] 6.5 Render transaction list: truncated sender address, USDC amount, relative timestamp
- [ ] 6.6 Render empty state when no transactions exist
- [ ] 6.7 Display payment link `woosh.app/pay/<slug>` with one-click copy and clipboard confirmation toast

## 7. Payment Page (`/pay/[slug]`)

- [ ] 7.1 Implement slug → walletAddress resolution in a server component or API route; return 404 for unknown slugs
- [ ] 7.2 Build amount entry field with validation (positive number, disables pay button on invalid input)
- [ ] 7.3 Integrate Wagmi wallet connection button (connect modal with available connectors)
- [ ] 7.4 Show connected wallet address after connection; display "Switch to Arc testnet" banner on wrong network
- [ ] 7.5 Implement `useUSDCBalance` check for sender's connected wallet; show insufficient-balance banner when balance < amount
- [ ] 7.6 Implement USDC `transfer(recipient, amount)` call via Wagmi `useWriteContract` or `useSendTransaction`
- [ ] 7.7 Handle wallet-rejected transaction — return to form without error
- [ ] 7.8 Handle on-chain failure — display error with retry option
- [ ] 7.9 Show success screen with transaction hash and confirmation message after successful payment

## 8. Onboarding Guide

- [ ] 8.1 Build dismissible overlay component (closes on X click or Escape key; preserves payment form state)
- [ ] 8.2 Step 1: display "Create a Woosh account" content with CTA → `/signup`
- [ ] 8.3 Step 2: display "Get testnet USDC" with one-click faucet request; prompt wallet connection if not yet connected
- [ ] 8.4 Implement Arc testnet faucet call for the sender's connected wallet address
- [ ] 8.5 Step 3: display "You're ready to pay" confirmation with CTA that dismisses guide and returns to payment form
- [ ] 8.6 Wire "I don't know where to start" link on payment page to open guide at Step 1
- [ ] 8.7 Wire insufficient-balance banner "Here's how to get some →" to open guide at Step 2
- [ ] 8.8 Verify guide shows no wallet selection menu — single linear path only

## 9. Polish & QA

- [ ] 9.1 Verify all pages are mobile-first and render correctly at 375px
- [ ] 9.2 Audit all visible copy for crypto jargon and replace with plain language
- [ ] 9.3 Add loading skeletons or spinners for async data (balance, transaction history)
- [ ] 9.4 Test end-to-end happy path: signup → dashboard → share link → pay from external wallet
- [ ] 9.5 Test onboarding guide flow: trigger → Step 1 → Step 2 (faucet) → Step 3 → pay
- [ ] 9.6 Test error states: unknown slug, insufficient balance, wrong network, failed transaction
