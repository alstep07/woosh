import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const base = "w-full font-semibold py-3 rounded-input transition-colors min-h-[44px]";
  const variants = {
    primary: "bg-blue-primary hover:enabled:bg-blue-secondary disabled:opacity-50 text-white shadow-glow",
    ghost: "bg-white/5 hover:bg-white/10 border border-white/10 text-text-secondary hover:text-text-primary font-medium text-sm",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}
