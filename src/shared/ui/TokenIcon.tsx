const SRC: Record<string, string> = {
  USDC: "/tokens/usdc.svg",
  EURC: "/tokens/eurc.svg",
  cirBTC: "/tokens/cirbtc.svg",
};

interface Props {
  symbol: string;
  /** Pixel size (square). Defaults to 24. */
  size?: number;
  className?: string;
}

/**
 * Official Circle/cirBTC token mark (from the Circle Brand Kit), replacing the
 * hand-drawn $/€/₿-in-a-colored-circle placeholders used everywhere balances/tokens
 * are shown. Falls back to a plain gray dot for an unrecognized symbol rather than
 * guessing at a glyph.
 */
export function TokenIcon({ symbol, size = 24, className = "" }: Props) {
  const src = SRC[symbol];
  if (!src) {
    return (
      <span
        aria-hidden
        className={`inline-block shrink-0 rounded-full bg-white/10 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    // Plain <img>, not next/image: SVG optimization needs images.dangerouslyAllowSVG
    // in next.config, and these are small trusted local static assets that gain
    // nothing from the optimizer anyway.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={symbol}
      width={size}
      height={size}
      className={`shrink-0 rounded-full ${className}`}
    />
  );
}
