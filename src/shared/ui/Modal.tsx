"use client";

import { useEffect } from "react";

interface ModalProps {
  onClose: () => void;
  /** When false, backdrop click / Escape / the ✕ are disabled (e.g. mid-transaction). */
  dismissible?: boolean;
  size?: "sm" | "md";
  children: React.ReactNode;
}

const SIZE: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
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
        className={`relative w-full ${SIZE[size]} h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto no-scrollbar glass-card rounded-none sm:rounded-card p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        {dismissible && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 z-10 text-text-secondary/40 hover:text-text-primary text-sm transition-colors"
          >
            ✕
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
