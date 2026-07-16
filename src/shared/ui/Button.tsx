import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** "sm" = compact inline button (page-header actions, empty-state CTAs); default = full-width form CTA. */
  size?: "default" | "sm";
}

export function Button({ variant = "primary", size = "default", className = "", ...props }: ButtonProps) {
  const base =
    "rounded-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary/50";
  const sizes = {
    default: "w-full font-semibold py-3 min-h-[44px]",
    sm: "shrink-0 text-sm font-semibold px-4 py-2",
  };
  const variants = {
    primary: "bg-blue-primary hover:enabled:bg-blue-secondary disabled:opacity-50 text-white shadow-glow",
    // secondary and ghost share the subtle glass style; secondary is the preferred name.
    secondary: "bg-white/5 hover:enabled:bg-white/10 disabled:opacity-40 border border-white/10 text-text-secondary hover:enabled:text-text-primary font-medium text-sm",
    ghost: "bg-white/5 hover:bg-white/10 border border-white/10 text-text-secondary hover:text-text-primary font-medium text-sm",
    danger: "bg-red-400/10 hover:enabled:bg-red-400/20 disabled:opacity-50 border border-red-400/20 text-red-400",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />
  );
}
