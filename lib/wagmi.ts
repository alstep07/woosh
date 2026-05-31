import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "./arc";

export const wagmiConfig = getDefaultConfig({
  appName: "Woosh",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  chains: [arcTestnet],
  ssr: true,
});
