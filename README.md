# Woosh

Card payments in. USDC on Arc in under a second. No wallet setup for the freelancer, no crypto knowledge for the client.

> The first payment tool where a client pays by card and a freelancer receives USDC instantly — without ever touching a crypto wallet.

Built for freelancers in emerging markets (UA, AR, NG, PK) who lose hundreds per year to traditional payment fees, poor bank coverage, or tools that require both sides to already be in crypto.

## How it works

**Freelancer (once)**  
Sign up with email → embedded wallet is created automatically → share a personal payment link (`/pay/username` or slug).

**Client (each payment)**  
Open the link → enter amount → pay by card → done.

**Behind the scenes**  
Fiat is converted to USDC via an on-ramp, settled on [Arc](https://docs.arc.network), and shown in a simple dashboard — like a bank balance, not a wallet UI.

## Why Arc

Arc is the network this product is built on because:

- USDC is native gas — recipients never need ETH or a second token
- Embedded wallets can run entirely on USDC without paymaster surcharges or developer gas subsidies
- Sub-second finality fits a “paid → balance updated” experience

On typical EVM alternatives, gas abstraction often means extra cost or operational burden — a poor fit for non-crypto users.

## Status

**V1 in progress** — payment links, email signup, embedded wallet, card on-ramp, USDC settlement, and a basic dashboard.

| Version | Focus |
|---------|--------|
| **V1** | Payment link, card pay, USDC settlement |
| **V2** | Invoicing, PDF export, payment history |
| **V3** | Recurring payments |
| **V4** | Multi-recipient payroll |
| **V5** | Off-ramp, localization |

Not in V1: fiat off-ramp, invoice PDFs, recurring or multi-recipient flows.

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js (App Router), Tailwind CSS |
| Web3 | Wagmi, Viem |
| Wallets | Circle Programmable Wallets (email → embedded wallet) |
| On-ramp | Transak (card → USDC) |
| Network | Arc testnet → Arc mainnet |

## Development

The app scaffold is not in this repo yet. When it lands, setup will look roughly like:

```bash
# clone, install, configure env, run dev server
git clone <repo-url>
cd woosh
cp .env.example .env.local   # Circle, Transak, Arc RPC keys
npm install
npm run dev
```

Required configuration (names may change with the scaffold):

- Circle Programmable Wallets API credentials
- Transak API key / partner setup
- Arc RPC URL (testnet: see [Arc docs](https://docs.arc.network))

## Docs & links

- [Arc documentation](https://docs.arc.network)
- [Circle Wallets SDK](https://developers.circle.com/w3s/docs)
- [Transak docs](https://docs.transak.com)
- [Arc House community](https://community.arc.io)

## Project context

[`CLAUDE.md`](./CLAUDE.md) holds full product context for contributors and AI assistants: roadmap detail, V1 user stories, competitive framing, and Arc Architects notes.

## License

TBD.
