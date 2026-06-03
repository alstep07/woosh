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
  transport: http(env.arcRpcUrl, { timeout: 5_000 }),
});

/** Arc testnet faucet — POST {address} to claim USDC */
export const ARC_FAUCET_URL = env.arcFaucetUrl;
