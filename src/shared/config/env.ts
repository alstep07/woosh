export const APP_VERSION = "2.1";

export const env = {
  circleAppId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID ?? "",
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  arcRpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.network",
  arcChainId: Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID ?? 5042002),
  arcExplorerUrl: process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://testnet.arcscan.app",
  arcFaucetUrl: process.env.NEXT_PUBLIC_ARC_FAUCET_URL ?? "https://faucet-testnet.arc.network",
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
  slugRegistryAddress: process.env.NEXT_PUBLIC_SLUG_REGISTRY_ADDRESS as `0x${string}` | undefined,
};
