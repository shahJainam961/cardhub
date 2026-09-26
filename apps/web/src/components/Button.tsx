import type { ButtonHTMLAttributes } from "react";

/**
 * Sticker buttons: ink outline and a hard ink shadow that the button presses down onto, like
 * pushing a real game token.
 */
const VARIANTS = {
  primary: "bg-sunny text-ink hover:brightness-105",
  accent: "bg-grape text-white hover:brightness-110",
  secondary: "bg-white text-ink hover:bg-cloud",
  danger: "bg-cherry text-white hover:brightness-105",
  success: "bg-mint text-ink hover:brightness-105",
  ghost: "bg-white/25 text-white hover:bg-white/35",
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
      className={`min-h-12 cursor-pointer rounded-2xl border-[2.5px] border-ink px-5 py-2 font-display text-lg font-semibold shadow-[3px_4px_0_var(--color-ink)] transition-[transform,box-shadow,filter] duration-100 select-none active:translate-x-[3px] active:translate-y-[4px] active:shadow-none focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-sunny disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-0 disabled:active:shadow-[3px_4px_0_var(--color-ink)] ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
