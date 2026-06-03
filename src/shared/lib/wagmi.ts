import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "./arc";
import { env } from "@/shared/config/env";

export const wagmiConfig = getDefaultConfig({
  appName: "Woosh",
  projectId: env.walletConnectProjectId,
  chains: [arcTestnet],
  ssr: true,
});
