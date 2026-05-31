import { createConfig, http } from "wagmi";
import { injected, coinbaseWallet, walletConnect } from "wagmi/connectors";
import { arcTestnet } from "./arc";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [
    injected(),
    coinbaseWallet({ appName: "Woosh" }),
    walletConnect({ projectId }),
  ],
  transports: {
    [arcTestnet.id]: http(),
  },
  ssr: true,
});
