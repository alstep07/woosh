import { env, APP_VERSION } from "@/shared/config/env";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 px-6 py-4 text-text-secondary text-sm shrink-0">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
        <span className="text-text-secondary/40 text-xs">© {new Date().getFullYear()} Woosh · v{APP_VERSION}</span>
        <div className="flex items-center gap-4 text-xs">
          <a
            href={env.arcExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text-primary transition-colors"
          >
            Explorer
          </a>
          <a
            href="https://faucet-testnet.arc.network"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text-primary transition-colors"
          >
            Faucet
          </a>
          <a
            href="https://github.com/alstep07/woosh"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text-primary transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
