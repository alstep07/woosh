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
    <div className="text-center py-1">
      <div className="w-14 h-14 rounded-full bg-green-400/10 border border-green-400/20 flex items-center justify-center mx-auto mb-4 text-2xl text-green-400">
        ✓
      </div>
      <h2 className="text-lg font-bold text-text-primary mb-1.5">{title}</h2>
      {body && <p className="text-text-secondary text-sm mb-5 leading-relaxed">{body}</p>}
      {children}
      <button
        onClick={onClose}
        className="mx-auto mt-4 block rounded-input px-3 py-1.5 text-xs font-medium text-text-secondary/50 transition-colors hover:bg-white/5 hover:text-text-secondary"
      >
        {closeLabel}
      </button>
    </div>
  );
}
