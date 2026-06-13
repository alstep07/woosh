# User Flows — Woosh

## Recipient (V1 — wallet address link)
1. Sign up with email, enter OTP
2. Circle creates UCW embedded wallet
3. Get payment link → `woosh.app/pay/0x...`
4. Share link
5. See balance + transaction history in dashboard

## Recipient (V1.5+ — slug link)
After wallet creation:
- Redirected to `/dashboard` (slug claim is voluntary, not forced)
- Dashboard shows "Claim a username" CTA in PaymentLinkCard (top-right)
- `/slug-setup`: pre-filled from email prefix, on-chain availability check (500ms debounce)
- If taken → suggestions: `alex1`, `alex_pay`, `alex2026`
- Submit → email OTP re-auth → PIN challenge → slug registered on-chain
- Payment link becomes `wooshapp.xyz/pay/alex`

## Sender — external wallet
1. Open `/pay/[slug]`
2. Enter amount
3. Connect wallet via WalletConnect / RainbowKit
4. Pay USDC on Arc
5. Done — recipient gets funds in <1 second

## Sender — Woosh account
1. Open `/pay/[slug]`
2. Enter amount
3. Click Pay → Circle PIN iframe appears
4. Enter PIN → tx signed and broadcast

## Sender — needs onboarding
1. Open `/pay/[slug]`
2. Click "I don't know where to start"
3. Onboarding guide (non-blocking, dismissible):
   - Step 1: Create Woosh account (email + PIN → UCW wallet)
   - Step 2: Get USDC → faucet link (testnet) / Transak on-ramp (mainnet V4)
   - Step 3: Return and pay
4. Zero USDC banner shown automatically if wallet connected but empty

## Chat Agent — send payment
1. User types "send $10 to alex"
2. Agent resolves slug server-side → confirms address
3. Confirmation card: "Send $10.00 to alex (…a3f2)?"
4. User clicks Confirm
5. Tries cached `woosh_session_token` first → if valid: PIN iframe → paid
6. If expired: email OTP inline → new token cached → PIN iframe → paid
7. Status bubbles: confirmed → sending → paid (explorer link)

## Chat Agent — check balance / history
- "What's my balance?" → `get_balance` tool → viem RPC read
- "Did alex pay me?" → `resolve_slug` + `get_transaction_history` → answer
- "How much did I spend this month?" → `get_transaction_history` → aggregated total

## Slug registration
1. `/slug-setup` page loads → pre-fills slug from email prefix
2. On every keystroke (debounced 500ms): `isAvailable()` on-chain read
3. Status: idle / checking / available / taken / invalid / error
4. Submit → POST `/api/slug/register` → `challengeId`
5. `sdk.execute(challengeId)` → PIN → slug registered on-chain
6. Slug stored in localStorage session cache
