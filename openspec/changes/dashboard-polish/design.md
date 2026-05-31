## Context

The dashboard hardcodes `woosh.app/pay/${slug}` as the payment link display and copy value. In local dev this produces a wrong URL. The dashboard also has no logout — users must manually clear localStorage. Transaction hashes are displayed as plain text with no way to verify them on-chain.

## Goals / Non-Goals

**Goals:**
- Environment-aware payment link using `NEXT_PUBLIC_BASE_URL`
- Logout button that clears session and redirects home
- Each transaction row links to the Arc block explorer

**Non-Goals:**
- Redesigning the dashboard layout
- Adding a dedicated login page
- Transaction filtering or pagination

## Decisions

**Base URL via env var**: Use `NEXT_PUBLIC_BASE_URL` defaulting to `http://localhost:3000`. The dashboard constructs the full payment link as `${baseUrl}/pay/${slug}`. This covers local dev, staging, and prod without code changes.

**Logout placement**: Add a "Log out" button in the `BrandHeader` right slot (same pattern as the landing page). Clears `woosh_session` from localStorage and calls `router.replace("/")`.

**Explorer links**: Wrap each transaction row's hash display in an `<a>` tag pointing to `${arcTestnet.blockExplorers.default.url}/tx/${tx.hash}`. Open in new tab. The explorer base URL is already defined in `lib/arc.ts` and reads from `NEXT_PUBLIC_ARC_EXPLORER_URL`.

## Risks / Trade-offs

- `NEXT_PUBLIC_BASE_URL` must be set correctly in production or links will point to localhost → document clearly in `.env.local.example`
- Block explorer URL for Arc testnet may differ from mainnet — already parameterized via env so no code change needed for mainnet launch
