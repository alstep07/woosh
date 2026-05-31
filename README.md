# Woosh

Cross-border USDC payments via a simple link. No bank, no ETH, no crypto knowledge required on either side.

> Send a link. Get paid in seconds. No bank required.

Built for freelancers in emerging markets (UA, AR, NG, PK) who lose hundreds per year to traditional payment fees, poor bank coverage, or tools that require both sides to already be in crypto.

## How it works

**Freelancer (once)**
Sign up with email → embedded wallet is created automatically → share a personal payment link (`/pay/username`).

**Client (each payment)**
Open the link → enter amount → pay with USDC from any wallet → done.

**No wallet? No problem.**
Clients who are new to crypto can follow a built-in onboarding guide:
- Create a Woosh account → embedded wallet by email, no seed phrases
- Get USDC → testnet faucet (one click), or fiat on-ramp in V2
- Return to the payment page and pay

**Behind the scenes**
USDC settles on Arc in under a second and appears in a simple dashboard — like a bank balance, not a wallet UI.

## Why Arc

- USDC is native gas — recipients never need ETH or a second token
- Embedded wallets run entirely on USDC with no paymaster surcharges
- Sub-second finality fits a "paid → balance updated" experience

On typical EVM alternatives, gas abstraction adds cost or operational burden — a poor fit for non-crypto users.

## Roadmap

| Version | Focus |
|---------|-------|
| **V1** | Payment links, embedded wallet, crypto-to-crypto |
| **V2** | Fiat on-ramp (Transak), fiat off-ramp, CCTP bridge |
| **V3** | Yield on idle USDC balance (Aave / USYC) |

Not in V1: fiat on/off-ramp, invoice PDFs, recurring or multi-recipient flows.

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js (App Router), Tailwind CSS |
| Language | TypeScript |
| Web3 | Wagmi, Viem |
| Wallets | Circle Programmable Wallets (email → embedded wallet) |
| On-ramp | Transak — V2 only |
| Network | Arc testnet → Arc mainnet |

## Development

```bash
git clone <repo-url>
cd woosh
cp .env.example .env.local
npm install
npm run dev
```

Required environment variables:

- Circle Programmable Wallets API credentials
- Arc RPC URL (testnet: see [Arc docs](https://docs.arc.network))
- Transak API key (V2)

## Docs & links

- [Arc documentation](https://docs.arc.network)
- [Circle Wallets SDK](https://developers.circle.com/w3s/docs)
- [Transak docs](https://docs.transak.com)

## Project context

[`CLAUDE.md`](./CLAUDE.md) holds full product context for contributors and AI assistants: user flows, V1 scope, competitive framing, and visual style.

## License

TBD.
