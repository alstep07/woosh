import { env, APP_VERSION } from "@/shared/config/env";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-4 text-text-secondary text-sm shrink-0">
      <div className="max-w-[73rem] mx-auto px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-text-secondary/40 text-xs">© {new Date().getFullYear()} Woosh · v{APP_VERSION}</span>
          <span className="inline-flex items-center gap-1.5 text-text-secondary/30 text-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/arc-icon-white.svg" alt="" aria-hidden="true" width={12} height={12} className="opacity-60" />
            Built on Arc
          </span>
        </div>
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
            href={env.arcFaucetUrl}
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
