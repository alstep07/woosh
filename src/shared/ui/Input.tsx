import { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
}

export function Input({ label, error, id, className = "", ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-text-secondary mb-1.5">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`w-full bg-border/40 border border-border rounded-input px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-blue-primary transition-colors disabled:opacity-50 ${className}`}
        {...props}
      />
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
