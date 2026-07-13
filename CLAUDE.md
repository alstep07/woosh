# CLAUDE.md, Woosh Project Context

## What We're Building

**Woosh**, a USDC payment platform for humans and AI agents.
Send a payment link, get paid instantly. No bank, no ETH, no friction.
Built on Arc, the only network where USDC is native gas.

> "Send a link. Get paid in seconds. No bank required."

**Why Arc:** USDC is native gas (no ETH ever), sub-second finality, Circle full-stack
integration (UCW, CCTP, StableFX, USYC). "No second token ever" is the killer feature.

---

## Current State, v3.0

| Version | Status | What shipped |
|---------|--------|-------------|
| V1 | ✅ | UCW wallet via email OTP, `/pay/0x...` payment links |
| V1.5 | ✅ | Onchain slug registry → `/pay/alex` |
| V2a | ✅ | Woosh Agent chat (Claude via OpenRouter, 4 tools) |
| V2b | ✅ | Direct payment execution from chat (PIN inline) |
| V2.2 | ✅ | Payment requests / invoices, onchain via `WooshInvoiceRegistry` (`/i/[id]` links, "My invoices" list, chat tools) |
| V3.0 | ✅ | Automated strategies, onchain via `WooshStrategyRegistry`: recurring USDC payments + DCA auto-buys (EURC/cirBTC). DCW executor (no PIN), Vercel Cron, swaps via Synthra SynRoute API. `/dashboard/strategies`, chat tools. Manual swap at `/dashboard/swap`. |
| V3.1+ | 🔄 | Next candidates: MCP server (repackage chat tools), multi-token dashboard balances, bridge/off-ramp |

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
            home ("no off-chain storage by default").
```

---

## Key Patterns (non-obvious, read before touching these areas)

**challenge/execute**, every onchain action (send, swap, register slug) follows:
server creates challenge → client `sdk.execute(challengeId)` → PIN iframe → done.
Never invent a new signing path. See `src/shared/lib/circle.ts`.

**UCW vs DCW**, UCW (user holds keys, PIN per tx) for humans. DCW (entitySecret,
no PIN) for autonomous operations. UCW cannot do recurring/scheduled actions. DCW is
implemented as the single shared **strategy executor** wallet (`src/shared/lib/dcw.ts`):
it triggers `WooshStrategyRegistry` executions on schedule and signs DCA swaps via the
Circle Wallets adapter, no raw private key.

**Strategies**, recurring payments are fully trustless (the contract forwards funds; the
executor only pays gas to trigger). DCA swaps are semi-custodial for one period at a time:
`releaseForSwap` hands the executor one period of USDC, it swaps via Synthra SynRoute API
and delivers the output straight to the owner. Cron is scheduler-agnostic
(`/api/cron/execute-strategies`, `CRON_SECRET`); free Vercel Cron tick = daily granularity
(finer needs an external pinger).

**Swap rail (Synthra SynRoute)**, all swaps on Arc testnet go through `trading-api.synthra.org`.
Circle App Kit / Stablecoin Service has no routes on testnet. Implementation in
`src/shared/lib/synroute.ts`: POST `/v1/quote` to check route, POST `/v1/swap` to get
calldata, execute approve + swap via `dcwExecuteRaw`. `slippageBps` in the API is a
PERCENTAGE (not true bps), `5` = 5%. `waitForTx` uses `SUCCESS = Set(["COMPLETE","CONFIRMED"])`
only, and swallows transient poll errors (a thrown poll would mis-trigger a refund).
`SYNTHRA_API_KEY` is server-only. `fmtOut()` formats all API amounts (no scientific
notation, values < 0.000001 show as `"<0.000001"`). Reported `amountOut` is the ACTUAL
output: recipient balance delta across the swap tx's block via RPC. Do NOT sum Transfer
events or explorer token-transfers for this: wrapped-native unwraps on the Synthra route
emit the credit twice (2x over-count), and a live balance delta can catch unrelated
concurrent transfers (e.g. late refunds). Falls back to live delta, then the quote.

**USDC decimals trap**, native USDC on Arc is 18 decimals, but the ERC-20 precompile at
`0x3600...0000` reports the SAME balance in 6 decimals. Any ERC-20 transfer of a native
amount must divide by 1e12 first (see refunds in `/api/wallet/swap/execute` and the cron).

**Manual swap two-step**, UCW flow: step 1 sends tokenIn to the executor via PIN; execute
route polls executor balance up to 5×2s before starting swap (avoids "funds not received"
race on sub-second Arc finality). Inner try/catch guarantees refund on any failure after
funds confirmed. `useChallengeFlow.cancel()` escapes a frozen PIN window via `cancelledRef`.

**Session storage**, all `woosh_*` keys managed via `src/shared/lib/session.ts`.
All calls wrapped in try/catch (Safari private mode). Never write raw sessionStorage
outside this module.

**Amount handling**, always string or bigint. No float arithmetic, no rounding.
Arc native USDC = 18 decimals. EURC = 6 decimals. cirBTC = 8 decimals.

**Agent integration is mandatory**, every new feature ships with a chat tool or at
minimum an updated system prompt so the agent can answer "can I do X?" and guide the
user. The chat agent is a first-class interface, not an afterthought.

**Agent robustness**, in `/api/chat`: act on `tool_calls` whenever present (do NOT gate on
`finish_reason`, some OpenRouter providers send "stop" with tool_calls). Token aliases are
handled in the system prompt AND in `normalizeTokenSymbol()` (bitcoin/BTC → cirBTC,
euro/EUR → EURC). ChatPanel appends bracketed outcome notes to action messages
([Action completed successfully] / [The user cancelled this action] / [FAILED]) so the
model never re-acts on stale requests; history is capped (30 client, 24 server) and
error messages are excluded from context.

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
NEXT_PUBLIC_ARC_FAUCET_URL=       # default: https://faucet.circle.com/
NEXT_PUBLIC_BASE_URL=

# Smart Contracts
NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS=      # WooshSlugRegistry on Arc
NEXT_PUBLIC_INVOICE_REGISTRY_ADDRESS=   # WooshInvoiceRegistry on Arc (payment requests)
NEXT_PUBLIC_STRATEGY_REGISTRY_ADDRESS=  # WooshStrategyRegistry on Arc (strategies)
NEXT_PUBLIC_CIRBTC_ADDRESS=             # cirBTC token (DCA target); EURC has a built-in default

# Strategies executor (V3.0, server only, autonomous, no PIN)
CIRCLE_ENTITY_SECRET=                # DCW entity secret (generate + register in Console)
EXECUTOR_WALLET_ID=                  # DCW executor wallet id (from /api/admin/provision-executor)
EXECUTOR_ADDRESS=                    # executor address; set via WooshStrategyRegistry.setExecutor
CRON_SECRET=                         # shared secret the cron + admin routes check

# Synthra SynRoute API (server only, all swaps on Arc testnet)
SYNTHRA_API_KEY=                     # from Synthra, required for /v1/quote and /v1/swap

# Woosh Agent
OPENROUTER_API_KEY=
ANTHROPIC_MODEL=                     # default: anthropic/claude-sonnet-5
```

---

## Docs

The `docs/` folder was removed from the repo (gitignored, kept as internal notes only).
In-repo documentation is this file plus [README.md](README.md) (features, stack, contract
addresses, setup) and [.env.local.example](.env.local.example) (annotated env reference).
Workflow: branch per feature, merge to main only after explicit approval.
