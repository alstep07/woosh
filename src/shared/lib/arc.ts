import { createPublicClient, http, defineChain } from "viem";
import { env } from "@/shared/config/env";

export const arcTestnet = defineChain({
  id: env.arcChainId,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [env.arcRpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "Arc Explorer",
      url: env.arcExplorerUrl,
    },
  },
  testnet: true,
});

export const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  // viem's http transport retries 3x by default; react-query hooks retry on top of
  // that (see Providers.tsx), so the two layers were compounding into ~4x the raw
  // calls on every rate-limited request, right when the RPC needed less load, not
  // more. One retry here is enough to smooth over a single dropped request.
  transport: http(env.arcRpcUrl, { timeout: 5_000, retryCount: 1 }),
});

/** Arc testnet faucet — POST {address} to claim USDC */
export const ARC_FAUCET_URL = env.arcFaucetUrl;
