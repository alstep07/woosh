import type { RecipientResolveStatus } from "@/entities/slug/hooks/useResolveRecipient";

interface Props {
  status: RecipientResolveStatus;
  resolvedAddress: `0x${string}` | null;
  knownAddresses?: string[];
  className?: string;
}

/**
 * Live feedback icon next to a recipient input: a spinner while the slug/address is
 * resolving, a green check once resolved and we've paid this address before, an amber
 * warning if resolved but this would be the first payment to it (native <title> gives
 * the "first time" explanation on hover, no separate tooltip component needed), or a
 * red mark if the resolve itself failed (RPC hiccup, not "this recipient doesn't
 * exist"), distinguishing a network problem from an actually-invalid recipient.
 * Renders nothing for idle/invalid, the input's own error text already covers that.
 */
export function RecipientStatusIcon({ status, resolvedAddress, knownAddresses, className = "" }: Props) {
  if (status === "loading") {
    return (
      <span
        className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-text-secondary/25 border-t-text-secondary/70 animate-spin ${className}`}
        role="status"
        aria-label="Checking recipient…"
      />
    );
  }

  if (status === "error") {
    return (
      <span
        className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full grid place-items-center text-[10px] font-bold text-red-400 bg-red-400/10 ${className}`}
        role="img"
        aria-label="Couldn't verify this recipient, network issue"
        title="Couldn't verify this recipient right now. Network issue, not necessarily invalid."
      >
        !
      </span>
    );
  }

  if (status === "valid" && resolvedAddress) {
    const isKnown = !!knownAddresses?.some((a) => a.toLowerCase() === resolvedAddress.toLowerCase());

    if (isKnown) {
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className={`shrink-0 ${className}`}
          role="img"
          aria-label="You've paid this address before"
        >
          <title>You&apos;ve paid this address before</title>
          <circle cx="7" cy="7" r="6.25" className="stroke-green-400/50" strokeWidth="1.1" />
          <path d="M4 7.1l2 2 4-4.3" className="stroke-green-400" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }

    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        className={`shrink-0 ${className}`}
        role="img"
        aria-label="First time paying this address"
      >
        <title>First time paying this address</title>
        <path
          d="M7 1.3l6.1 10.6a.9.9 0 01-.78 1.35H1.68a.9.9 0 01-.78-1.35L7 1.3z"
          className="fill-amber-400/15 stroke-amber-400/70"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path d="M7 5.4v2.9" className="stroke-amber-400" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="7" cy="10.2" r="0.7" className="fill-amber-400" />
      </svg>
    );
  }

  return null;
}
