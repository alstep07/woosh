## 1. Environment

- [x] 1.1 Add `NEXT_PUBLIC_BASE_URL=http://localhost:3000` to `.env.local`
- [x] 1.2 Add `NEXT_PUBLIC_BASE_URL=http://localhost:3000` to `.env.local.example`

## 2. Dashboard

- [x] 2.1 Update payment link construction to use `process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"` instead of hardcoded `woosh.app`
- [x] 2.2 Add "Log out" button to the BrandHeader right slot that clears `woosh_session` and calls `router.replace("/")`
- [x] 2.3 Wrap each transaction row in an `<a>` tag linking to `${arcTestnet.blockExplorers.default.url}/tx/${tx.hash}` opening in a new tab
