# Resources — Woosh

## External Documentation

| Resource | URL | Notes |
|----------|-----|-------|
| Arc Testnet docs | https://docs.arc.io | RPC, contracts, App Kit |
| Arc contract addresses | https://docs.arc.io/arc/references/contract-addresses.md | USDC, EURC, FxEscrow, CCTP |
| Circle UCW SDK | https://developers.circle.com/wallets/user-controlled | Main UCW reference |
| Circle UCW API reference | https://developers.circle.com/api-reference/wallets/user-controlled-wallets | All endpoints |
| Circle Console | https://console.circle.com | API keys, app IDs |
| StableFX API | https://developers.circle.com/stablefx.md | Swap via FxEscrow |
| StableFX taker quickstart | https://developers.circle.com/stablefx/quickstarts/fx-trade-taker.md | Full taker flow |
| StableFX OpenAPI | https://developers.circle.com/openapi/stablefx.yaml | All endpoints |
| Circle App Kit (Arc) | https://docs.arc.io/app-kit | Bridge, Swap SDK |
| App Kit Swap guide | https://docs.arc.io/app-kit/swap | DCA swap rail used in V3.0 (USDC/EURC/cirBTC) |
| App Kit adapter setups | https://docs.arc.io/app-kit/tutorials/adapter-setups | viem, ethers, **Circle Wallets** (DCW adapter we use) |
| Swap Kit packages | `@circle-fin/swap-kit` + `@circle-fin/adapter-circle-wallets` | `SwapKit.swap()` + `createCircleWalletsAdapter({ apiKey, entitySecret })`, kit key via `config.kitKey` (server `CIRCLE_KIT_KEY`) |
| Blockscout (Arc Testnet) | https://testnet.arcscan.app | Explorer + API |
| Supabase | https://supabase.com/docs | V2c+ |
| WalletConnect | https://cloud.walletconnect.com | Project ID |

---

## Circle UCW SDK — Key Methods

Package: `@circle-fin/user-controlled-wallets`

```typescript
// Auth
requestOtp(deviceId, email)              // → { deviceToken, deviceEncryptionKey, otpToken }
getUserToken(...)                        // → { userToken, encryptionKey }

// Wallet
createUserPinWithWallets(userToken, { blockchains, accountType })  // → { challengeId }
createUserWallet(userToken, ...)         // → { challengeId }
getUserWallets(userToken)                // → wallet[]
listWalletBalance(userToken, walletId)   // → balances[]

// Transactions
createTransaction(userToken, { walletId, destinationAddress, amounts, blockchain, tokenAddress })
                                         // → { challengeId }  — send tokens
createUserTransactionContractExecutionChallenge(userToken, { walletId, contractAddress,
  abiFunctionSignature, abiParameters })  // → { challengeId }  — call any contract

// Signing (EIP-712 typed data — used for StableFX swap)
signUserTypedData(userToken, { walletId, data: eip712String })
                                         // → { data: { challengeId } }

// Sign message (EIP-191)
signUserMessage(userToken, { walletId, message })
                                         // → { data: { challengeId } }
```

All `challengeId` values are executed client-side via `sdk.execute(challengeId, callback)` → PIN iframe.

---

## Circle W3S Web SDK — Key Methods

Package: `@circle-fin/w3s-pw-web-sdk`
Singleton in: `src/shared/lib/w3s.ts`

```typescript
getW3SSdk(appId)                         // get or create singleton
sdk.getDeviceId()                        // → deviceId string
sdk.updateConfigs({ appSettings, loginConfigs })
sdk.verifyOtp()                          // triggers OTP verification iframe
sdk.setAuthentication({ userToken, encryptionKey })
sdk.execute(challengeId, callback)       // triggers PIN iframe
setLoginHandler(fn)                      // register OTP success callback
```

---

## Arc Testnet Network Config

```
Chain ID:    5042002
RPC:         https://rpc.testnet.arc.network
Explorer:    https://testnet.arcscan.app
Faucet:      https://faucet.circle.com/
```

---

## Arc Testnet Network Updates (hardforks)

We run through Circle's hosted RPC (`rpc.testnet.arc.network`), so node-operator
upgrade deadlines do not apply to us, Circle upgrades the RPC. Important caveat: a
chain feature landing does not mean the Circle wallet SDK exposes it. Always verify
SDK support (`createTransaction` params, etc.) before building on a new capability.

| Version | Activates | Adds | Relevance to Woosh |
|---------|-----------|------|--------------------|
| v0.7.2 | 2026-06-18 12:00 UTC (testnet only, no mainnet timing) | Transaction memos, batch transactions | **Memos:** native "note / what for" on a plain `/pay` send, no contract needed (today memos live only in `WooshInvoiceRegistry`). **Batch:** multi-recipient payouts and paying several invoices in one tx (maps to the treasury/disbursement direction). Both blocked on confirming Circle UCW `createTransaction` actually exposes them. |

- Release notes: https://github.com/circlefin/arc-node/releases/tag/v0.7.2
- Breaking changes: https://github.com/circlefin/arc-node/blob/main/BREAKING_CHANGES.md

---

## StableFX Swap Flow (UCW path)

Requires: `CIRCLE_API_KEY`, `OPENROUTER_API_KEY` (or direct Circle calls), kit key from Circle Console for App Kit.

```
1. POST /v1/exchange/stablefx/quotes → { typedData, id }
2. signUserTypedData(userToken, { walletId, data: typedData }) → { challengeId }
3. sdk.execute(challengeId) → PIN #1 → quote signature
4. POST /v1/exchange/stablefx/trades { quoteId, signature } → { id: tradeId }
5. POST /v1/exchange/stablefx/signatures/funding/presign → { typedData: fundingData }
6. signUserTypedData(userToken, { walletId, data: fundingData }) → { challengeId }
7. sdk.execute(challengeId) → PIN #2 → funding signature
8. POST /v1/exchange/stablefx/fund { signature } → 200 OK
```
