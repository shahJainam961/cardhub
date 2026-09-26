import { isWild, type UnoCard, type UnoColor } from "@cardhub/engine";
import { cardLabel } from "../cardLabel";

export const COLOR_BG: Record<UnoColor, string> = {
  red: "bg-red-600 text-white",
  yellow: "bg-yellow-400 text-slate-900",
  green: "bg-green-600 text-white",
  blue: "bg-blue-600 text-white",
};

const WILD_BG =
  "bg-[conic-gradient(var(--color-red-600)_0_25%,var(--color-yellow-400)_0_50%,var(--color-green-600)_0_75%,var(--color-blue-600)_0)] text-white";

const SYMBOLS = { skip: "⊘", reverse: "⇄", drawTwo: "+2", wild: "W", wildDrawFour: "+4" } as const;

const SIZES = {
  sm: "h-16 w-11 text-lg rounded-lg",
  md: "h-24 w-16 text-2xl rounded-xl",
  lg: "h-32 w-22 text-4xl rounded-2xl",
} as const;

function face(card: UnoCard): string {
  return card.kind === "number" ? String(card.value) : SYMBOLS[card.kind];
}

interface UnoCardViewProps {
  card: UnoCard;
  size?: keyof typeof SIZES;
  /** Renders a button; `playable` controls whether it is enabled and highlighted. */
  onClick?: () => void;
  playable?: boolean;
}

export function UnoCardView({ card, size = "md", onClick, playable = false }: UnoCardViewProps) {
  const colors = isWild(card) ? WILD_BG : COLOR_BG[card.color];
  const base = `${SIZES[size]} ${colors} relative flex shrink-0 items-center justify-center border-4 border-white font-black shadow-lg select-none`;
  const content = (
    <span className="flex h-3/5 w-4/5 items-center justify-center rounded-[50%] bg-white/90 text-slate-900 [text-shadow:none]">
      {face(card)}
    </span>
  );

  if (!onClick) {
    return (
      <div className={base} role="img" aria-label={cardLabel(card)}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${base} transition-transform ${
        playable
          ? "cursor-pointer ring-4 ring-amber-300 hover:-translate-y-3 focus-visible:-translate-y-3"
          : "cursor-not-allowed opacity-50"
      }`}
      onClick={onClick}
      disabled={!playable}
      aria-label={cardLabel(card)}
      data-testid="hand-card"
      data-playable={playable}
    >
      {content}
    </button>
  );
}

export function UnoCardBack({ size = "md" }: { size?: keyof typeof SIZES }) {
  return (
    <div
      className={`${SIZES[size]} flex shrink-0 items-center justify-center border-4 border-white bg-slate-900 font-black text-red-500 italic shadow-lg`}
      aria-hidden
    >
      <span className="-rotate-12 text-[0.6em]">UNO</span>
    </div>
  );
}
