import type { ButtonHTMLAttributes } from "react";

const VARIANTS = {
  primary: "bg-amber-400 text-slate-900 hover:bg-amber-300",
  secondary: "bg-white/10 text-white hover:bg-white/20",
  danger: "bg-red-600 text-white hover:bg-red-500",
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`min-h-11 rounded-xl px-4 py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
