## 1. Update build-v1 design.md

- [x] 1.1 Replace Decision #1 (Circle SDK) — change from DCW to UCW with rationale (non-custodial, no Entity Secret)
- [x] 1.2 Update Decision #4 (slug store) — change from "Circle metadata or env-backed JSON" to "module-level Map in lib/store.ts"
- [x] 1.3 Update Decision #3 (transaction history) — change from "event log filtering on USDC contract" to "block scanning last 200 blocks with `includeTransactions: true`; native USDC, no ERC20 contract"
- [x] 1.4 Add new decision: UCW 3-step signup flow with API route structure (`/api/wallet/request-otp`, `/api/wallet/initialize`, `/api/wallet/complete`)
- [x] 1.5 Update Risks section — remove "Circle SDK maturity on Arc testnet" mock fallback note; add UCW challenge UX risk (Circle iframe may show PIN prompt)

## 2. Update build-v1 specs/user-auth/spec.md

- [x] 2.1 Replace "Email-based signup creates embedded wallet" requirement with 3-step UCW OTP flow (matches sync-spec-to-impl/specs/user-auth/spec.md)
- [x] 2.2 Update "User session established after signup" — localStorage key and shape (`woosh_session` with `{email, slug, walletAddress}`)
- [x] 2.3 Add "Signup page multi-step state" requirement (email / verify / creating steps)
- [x] 2.4 Remove "Signup form validation" requirement (client-side email validation removed)
- [x] 2.5 Remove "Email already registered error" requirement (UCW handles re-auth natively)

## 3. Update build-v1 tasks.md

- [x] 3.1 Update task 2.2 — replace `createEmbeddedWallet(email)` with actual UCW functions: `requestOtp`, `initializeUser`, `getUserWallets`
- [x] 3.2 Update task 2.1 — note that Circle SDK used is `@circle-fin/user-controlled-wallets` + `@circle-fin/w3s-pw-web-sdk` (not DCW SDK); `CIRCLE_WALLET_SET_ID` not used
- [x] 3.3 Update task 5.1 — remove "client-side email validation" note (not in final implementation)
- [x] 3.4 Update task 5.2 — replace reference to `createEmbeddedWallet` server action with `/api/wallet/request-otp` + `/api/wallet/initialize` + `/api/wallet/complete`
- [x] 3.5 Update task 5.3 — remove "Handle duplicate email error" (not applicable with UCW)
- [x] 3.6 Update task 5.4 — update session storage description: localStorage key `woosh_session`, shape `{email, slug, walletAddress}`
- [x] 3.7 Mark tasks 9.4, 9.5, 9.6 with current status (unchecked — E2E testing not yet done)
