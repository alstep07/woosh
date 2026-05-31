import { createPublicClient, http, defineChain } from "viem";

export const arcTestnet = defineChain({
  id: parseInt(process.env.NEXT_PUBLIC_ARC_CHAIN_ID ?? "3693"),
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc-testnet.arc.network",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Arc Explorer",
      url: process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://explorer-testnet.arc.network",
    },
  },
  testnet: true,
});

export const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc-testnet.arc.network"),
});

/** Arc testnet faucet — POST {address} to claim USDC */
export const ARC_FAUCET_URL =
  process.env.NEXT_PUBLIC_ARC_FAUCET_URL ?? "https://faucet-testnet.arc.network/api/claim";
