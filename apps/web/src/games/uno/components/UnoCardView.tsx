import { isWild, type UnoCard, type UnoColor } from "@cardhub/engine";
import { cardLabel } from "@cardhub/shared";
import { motion, type MotionStyle } from "motion/react";

/** Card face colors, tuned to be bright but readable under an ink outline. */
export const UNO_HEX: Record<UnoColor, string> = {
  red: "#ff4d5e",
  yellow: "#ffd23f",
  green: "#2ed3a0",
  blue: "#4c8dff",
};

/** Kept for places that color small UI bits (e.g. the color picker). */
export const COLOR_BG: Record<UnoColor, string> = {
  red: "bg-[#ff4d5e] text-white",
  yellow: "bg-[#ffd23f] text-ink",
  green: "bg-[#2ed3a0] text-ink",
  blue: "bg-[#4c8dff] text-white",
};

const SYMBOLS = { skip: "⊘", reverse: "⇄", drawTwo: "+2", wild: "★", wildDrawFour: "+4" } as const;

const SIZES = {
  sm: { box: "h-16 w-11 rounded-lg border-2", center: "text-xl", corner: "text-[0.55rem]" },
  md: { box: "h-28 w-20 rounded-xl border-[3px]", center: "text-4xl", corner: "text-xs" },
  lg: { box: "h-36 w-26 rounded-2xl border-[3px]", center: "text-5xl", corner: "text-sm" },
} as const;

const WILD_FACE =
  "conic-gradient(from 45deg, #ff4d5e 0 25%, #ffd23f 0 50%, #2ed3a0 0 75%, #4c8dff 0)";

function face(card: UnoCard): string {
  return card.kind === "number" ? String(card.value) : SYMBOLS[card.kind];
}

interface UnoCardViewProps {
  card: UnoCard;
  size?: keyof typeof SIZES;
  /** Renders a button; `playable` controls whether it is enabled and highlighted. */
  onClick?: () => void;
  playable?: boolean;
  /** Your turn but this card can't be played: fade it slightly so playable cards stand out. */
  dimmed?: boolean;
  /** Shared-layout id so the card can fly between hand and pile. */
  layoutId?: string;
  style?: MotionStyle;
  className?: string;
}

/** Our own sticker-style card: ink outline, tilted center oval, big outlined symbol, corner marks. */
export function UnoCardView({
  card,
  size = "md",
  onClick,
  playable = false,
  dimmed = false,
  layoutId,
  style,
  className = "",
}: UnoCardViewProps) {
  const s = SIZES[size];
  const wild = isWild(card);
  const background = wild ? "#1f1a4d" : UNO_HEX[card.color];
  const ink = !wild && (card.color === "yellow" || card.color === "green") ? "#1f1a4d" : "white";
  const symbol = face(card);

  const body = (
    <>
      <span
        className={`absolute top-1 left-1.5 font-display font-bold ${s.corner}`}
        style={{ color: ink }}
      >
        {symbol}
      </span>
      <span
        className={`absolute right-1.5 bottom-1 rotate-180 font-display font-bold ${s.corner}`}
        style={{ color: ink }}
      >
        {symbol}
      </span>
      <span
        className="flex h-[70%] w-[82%] -rotate-[22deg] items-center justify-center rounded-[50%] border-2 border-ink"
        style={{ background: wild ? WILD_FACE : "white" }}
      >
        <span
          className={`rotate-[22deg] font-display font-bold ${s.center}`}
          style={{
            color: wild ? "white" : background,
            WebkitTextStroke: "1.5px #1f1a4d",
            paintOrder: "stroke fill",
            textShadow: "2px 2px 0 #1f1a4d",
          }}
        >
          {symbol}
        </span>
      </span>
    </>
  );

  const base = `relative flex shrink-0 items-center justify-center border-ink shadow-[2px_3px_0_#1f1a4d] select-none ${s.box} ${className}`;

  if (!onClick) {
    return (
      <motion.div
        {...(layoutId ? { layoutId } : {})}
        className={base}
        style={{ background, ...style }}
        role="img"
        aria-label={cardLabel(card)}
      >
        {body}
      </motion.div>
    );
  }
  return (
    <motion.button
      {...(layoutId ? { layoutId } : {})}
      type="button"
      className={`${base} ${playable ? "cursor-pointer" : "cursor-default"} ${dimmed ? "opacity-60" : ""}`}
      style={{ background, ...style }}
      onClick={onClick}
      disabled={!playable}
      aria-label={cardLabel(card)}
      data-testid="hand-card"
      data-playable={playable}
      whileHover={playable ? { y: -18, rotate: 0, scale: 1.06, zIndex: 20 } : {}}
      whileTap={playable ? { scale: 0.96 } : {}}
    >
      {body}
    </motion.button>
  );
}

/** The back of a card: ink with a bright cardhub badge. */
export function UnoCardBack({
  size = "md",
  className = "",
  style,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  style?: MotionStyle;
}) {
  const s = SIZES[size];
  return (
    <motion.div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden border-ink bg-ink shadow-[2px_3px_0_#1f1a4d] ${s.box} ${className}`}
      {...(style ? { style } : {})}
      aria-hidden
    >
      <span className="absolute inset-1 rounded-[inherit] border-2 border-dashed border-white/25" />
      {size === "sm" ? (
        // Too small for the logo: just the bright oval.
        <span className="h-[55%] w-[70%] -rotate-[22deg] rounded-[50%] bg-gradient-to-br from-bubblegum to-grape" />
      ) : (
        <span
          className={`flex h-[62%] w-[80%] -rotate-[22deg] items-center justify-center rounded-[50%] border-2 border-white ${s.corner}`}
          style={{ background: "linear-gradient(135deg, #ff5fa2, #7b5cff)" }}
        >
          <span className="rotate-[22deg] font-display text-[1.15em] font-bold text-white">
            cardhub
          </span>
        </span>
      )}
    </motion.div>
  );
}
