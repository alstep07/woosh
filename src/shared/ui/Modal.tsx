"use client";

import { useEffect } from "react";

interface ModalProps {
  onClose: () => void;
  /** When false, backdrop click / Escape / the ✕ are disabled (e.g. mid-transaction). */
  dismissible?: boolean;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

const SIZE: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
};

/**
 * App modal. On mobile it fills the screen (keyboard-friendly: content scrolls from the
 * top rather than hiding behind the keyboard); on sm+ it's a centered glass card. Handles
 * body-scroll lock and Escape-to-close. The ✕ and backdrop only dismiss when `dismissible`.
 */
export function Modal({ onClose, dismissible = true, size = "md", children }: ModalProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (dismissible && e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [dismissible, onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-stretch sm:items-center justify-center sm:px-4 bg-black/60 backdrop-blur-sm"
      onClick={() => { if (dismissible) onClose(); }}
    >
      <div
        className={`relative flex flex-col w-full ${SIZE[size]} h-full sm:h-auto sm:max-h-[90vh] glass-card rounded-none sm:rounded-card`}
        onClick={(e) => e.stopPropagation()}
      >
        {dismissible && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3.5 right-3.5 z-10 flex h-8 w-8 items-center justify-center rounded-full text-text-secondary/50 transition-colors hover:bg-white/[0.08] hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/40"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 2.5l9 9M11.5 2.5l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {/* min-h-0 lets this child shrink below its content size inside the flex column,
            which is required for overflow-y-auto to actually scroll instead of the box
            growing past max-h-[90vh] (glass-card sets overflow:hidden on the outer box,
            clipping anything that overflows it). */}
        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar p-6 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
