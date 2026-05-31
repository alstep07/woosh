## Why

The dashboard lacks a logout option, transaction links go nowhere, and the payment link shown to users uses a hardcoded domain instead of the actual app URL — making it wrong in local dev and any non-production environment.

## What Changes

- Add `NEXT_PUBLIC_BASE_URL` env var (defaults to `http://localhost:3000`) used to construct the payment link shown in the dashboard
- Add a logout button to the dashboard that clears `woosh_session` from localStorage and redirects to the landing page
- Make each transaction in the history list a clickable link to the Arc block explorer for that transaction hash

## Capabilities

### New Capabilities

- `dashboard-ux`: Logout flow, explorer-linked transactions, and environment-aware payment link URL

### Modified Capabilities

- `dashboard`: Payment link now uses `NEXT_PUBLIC_BASE_URL`; transaction list items link to block explorer

## Impact

- `app/dashboard/page.tsx`: logout button, explorer links on tx rows, updated payment link construction
- `.env.local` and `.env.local.example`: new `NEXT_PUBLIC_BASE_URL` variable
- `lib/arc.ts`: read explorer URL for linking (already has `arcTestnet.blockExplorers.default.url`)
