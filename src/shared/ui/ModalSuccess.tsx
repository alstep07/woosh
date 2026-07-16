"use client";

import type { ReactNode } from "react";

interface Props {
  title: string;
  body?: ReactNode;
  /** Extra content between the body and the close action, e.g. a "copy link" button. */
  children?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
}

/**
 * The done-state shared by every action modal that finishes with a green checkmark:
 * strategies, savings, invoices. Keeps the circle/title/close styling in one place.
 */
export function ModalSuccess({ title, body, children, onClose, closeLabel = "Close" }: Props) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center mx-auto mb-3 text-2xl">
        ✓
      </div>
      <h2 className="text-lg font-bold text-text-primary mb-1">{title}</h2>
      {body && <p className="text-text-secondary text-sm mb-4">{body}</p>}
      {children}
      <button
        onClick={onClose}
        className="block mx-auto mt-2 text-xs text-text-secondary/50 hover:text-text-secondary transition-colors"
      >
        {closeLabel}
      </button>
    </div>
  );
}
