# CLAUDE.md, Woosh Project Context

## What We're Building

**Woosh**, a USDC payment platform for humans and AI agents.
Send a payment link, get paid instantly. No bank, no ETH, no friction.
Built on Arc, the only network where USDC is native gas.

> "Send a link. Get paid in seconds. No bank required."

**Why Arc:** USDC is native gas (no ETH ever), sub-second finality, Circle full-stack
integration (UCW, CCTP, StableFX, USYC). "No second token ever" is the killer feature.

---

## Current State, v2.2

| Version | Status | What shipped |
|---------|--------|-------------|
| V1 | ✅ | UCW wallet via email OTP, `/pay/0x...` payment links |
| V1.5 | ✅ | Onchain slug registry → `/pay/alex` |
| V2a | ✅ | Woosh Agent chat (Claude via OpenRouter, 4 tools) |
| V2b | ✅ | Direct payment execution from chat (PIN inline) |
| V2.2 | ✅ | Payment requests / invoices, onchain via `WooshInvoiceRegistry` (`/i/[id]` links, "My invoices" list, chat tools) |
| V2c+ | 🔄 | See [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) |

---

## Tech Stack

```
Frontend:   Next.js 14 (App Router), TypeScript strict, Tailwind CSS
Web3:       Wagmi + Viem, Circle UCW SDK (@circle-fin/user-controlled-wallets)
AI:         Claude via OpenRouter (openai npm pkg, baseURL: openrouter.ai/api/v1)
Contracts:  Solidity on Arc, Foundry
Network:    Arc Testnet (chain 5042002) → Mainnet summer 2026
DB:         None, onchain + Blockscout is the source of truth. A backend DB is
            deliberately deferred until a feature needs state with no onchain/derivable
            home (see ARCHITECTURE → "No off-chain storage by default").
```

---

## Key Patterns (non-obvious, read before touching these areas)

**challenge/execute**, every onchain action (send, swap, register slug) follows:
server creates challenge → client `sdk.execute(challengeId)` → PIN iframe → done.
Never invent a new signing path. See `src/shared/lib/circle.ts`.

**UCW vs DCW**, UCW (user holds keys, PIN per tx) for humans. DCW (entitySecret,
no PIN) for autonomous agent operations. UCW cannot do recurring/scheduled actions.
See [Architecture](docs/ARCHITECTURE.md#wallet-architecture).

**Session storage**, all `woosh_*` keys managed via `src/shared/lib/session.ts`.
All calls wrapped in try/catch (Safari private mode). Never write raw sessionStorage
outside this module.

**Amount handling**, always string or bigint. No float arithmetic, no rounding.
Arc native USDC = 18 decimals. StableFX/EURC = 6 decimals.

**Agent integration is mandatory**, every new feature ships with a chat tool or at
minimum an updated system prompt so the agent can answer "can I do X?" and guide the
user. The chat agent is a first-class interface, not an afterthought.

**Copy style**, user-facing text AND agent output: never use long dashes (em or en
dashes); use commas or periods. Write "onchain" as one word, never hyphenated. Keep
this rule in the chat system prompt too so the agent follows it.

---

## Environment Variables

```bash
# Circle (backend only)
CIRCLE_API_KEY=

# Circle (frontend)
NEXT_PUBLIC_CIRCLE_APP_ID=

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Arc Network (all have defaults for testnet)
NEXT_PUBLIC_ARC_RPC_URL=          # default: https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_CHAIN_ID=         # default: 5042002
NEXT_PUBLIC_ARC_EXPLORER_URL=     # default: https://testnet.arcscan.app
NEXT_PUBLIC_ARC_FAUCET_URL=       # default: https://faucet-testnet.arc.network
NEXT_PUBLIC_BASE_URL=

# Smart Contracts
NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS=      # WooshSlugRegistry on Arc
NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS=   # WooshInvoiceRegistry on Arc (payment requests)

# Woosh Agent
OPENROUTER_API_KEY=
ANTHROPIC_MODEL=                     # default: anthropic/claude-3-5-sonnet
```

---

## Docs

Read only when the task directly requires it, don't load all docs upfront.

| File | When to open | What's inside |
|------|-------------|--------------|
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | Before starting any feature or fix, branching rules, naming, merge process | Branch-per-feature workflow, agent responsibilities, merge criteria |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | When deciding what to build next or understanding phase priorities | What to build next, ordered by value/effort, architecture constraints |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | When adding routes, new wallet logic, contracts, or touching the FSD layer structure | Wallet arch, contracts, TypeScript types, routes, API principles, FSD structure |
| [docs/USER_FLOWS.md](docs/USER_FLOWS.md) | When implementing or debugging a user-facing flow (signup, pay, slug claim, chat) | Step-by-step flows for every user type |
| [docs/DESIGN.md](docs/DESIGN.md) | When writing UI, colors, spacing, component style | Visual style tokens, UX principles |
| [docs/RESOURCES.md](docs/RESOURCES.md) | When you need a specific Circle SDK method, Arc contract address, or external API reference | External docs, Circle SDK methods, Arc contracts |
| [docs/CONTENT_GUIDELINES.md](docs/CONTENT_GUIDELINES.md) | When writing or updating any public-facing content: a social post, thread, announcement, or marketing/app copy about Woosh, Arc, or USDC. Read it before drafting, and when applying general content/tone rules | Arc voice and tone, naming, what to emphasize and avoid, amplification guardrails |
