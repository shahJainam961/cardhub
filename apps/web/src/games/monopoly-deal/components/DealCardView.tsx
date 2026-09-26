import { COLOR_INFO, colorsOf, DEAL_COLORS, type DealCard, type DealColor } from "@cardhub/engine";
import { ACTION_NAMES, COLOR_NAMES, dealCardLabel } from "@cardhub/shared";
import { motion } from "motion/react";
import { COLOR_HEX, COLOR_TEXT } from "../colors";

const ACTION_TEXT = {
  dealBreaker: "Steal a complete set",
  justSayNo: "Cancel an action against you",
  slyDeal: "Steal one property",
  forcedDeal: "Swap a property",
  debtCollector: "One player pays you 5M",
  birthday: "Everyone pays you 2M",
  passGo: "Draw 2 cards",
  house: "+3M rent on a set",
  hotel: "+4M rent on a set with a house",
  doubleRent: "Play with a rent card",
} as const;

const ACTION_ICON = {
  dealBreaker: "💥",
  justSayNo: "✋",
  slyDeal: "🕵️",
  forcedDeal: "🔄",
  debtCollector: "💸",
  birthday: "🎂",
  passGo: "➡️",
  house: "🏠",
  hotel: "🏨",
  doubleRent: "✖️2",
} as const;

function stripes(colors: readonly string[]): string {
  const step = 100 / colors.length;
  return `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(", ")})`;
}

const SIZES = {
  xs: {
    box: "h-7 w-5 rounded-[4px] border-[1.5px]",
    header: "h-full",
    title: "text-[0.45rem]",
    icon: "text-[0.55rem]",
    value: "",
  },
  sm: {
    box: "h-16 w-11 rounded-md border-2",
    // Tall enough to hold the value badge, so it never covers the name.
    header: "h-3",
    title: "text-[0.45rem]",
    icon: "text-sm",
    value: "text-[0.45rem] px-0.5",
  },
  md: {
    box: "h-28 w-20 rounded-xl border-[2.5px]",
    header: "h-4",
    title: "text-[0.62rem]",
    icon: "text-2xl",
    value: "text-[0.6rem] px-1",
  },
} as const;

/**
 * The rent a set earns by how many cards it has, as printed on property cards: one row per
 * card count on bigger cards, a compact "1·2·4" line on small ones.
 */
function RentLadder({ color, small, dot }: { color: DealColor; small: boolean; dot: boolean }) {
  const { rent } = COLOR_INFO[color];
  const swatch = dot && (
    <span
      className="inline-block size-1.5 shrink-0 rounded-full border border-ink"
      style={{ background: COLOR_HEX[color] }}
    />
  );
  if (small) {
    return (
      <span className="flex items-center justify-center gap-0.5 text-[0.45rem] leading-none font-black">
        {swatch}
        {rent.join("·")}M
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-px" aria-hidden>
      {rent.map((amount, i) => (
        <span
          key={i}
          className="flex items-center gap-0.5 text-[0.55rem] leading-none font-extrabold"
        >
          {swatch}
          <span className="inline-flex h-2.5 min-w-2 items-center justify-center rounded-[2px] border border-ink/60 bg-white px-px text-[0.45rem]">
            {i + 1}
          </span>
          <span className="flex-1 border-b border-dotted border-ink/40" />
          <span>{amount}M</span>
        </span>
      ))}
    </span>
  );
}

interface DealCardViewProps {
  card: DealCard;
  onClick?: () => void;
  /** Highlighted as selectable / selected. */
  active?: boolean;
  selected?: boolean;
  disabled?: boolean;
  /** "sm" for cards laid on a table (banks and property stacks), "xs" for the mini tables. */
  size?: keyof typeof SIZES;
  className?: string;
}

/** A Monopoly Deal card, sticker style: colored band, icon or name, bank value in the corner. */
export function DealCardView({
  card,
  onClick,
  active = false,
  selected = false,
  disabled = false,
  size = "md",
  className = "",
}: DealCardViewProps) {
  const s = SIZES[size];
  const small = size === "sm";
  let header: string;
  let headerText = "#1f1a4d";
  let title = dealCardLabel(card);
  let subtitle = "";
  let icon: string | null = null;
  let face = "white";
  // Colors whose rent ladder is printed on the card (properties and two-color wilds).
  let rentColors: DealColor[] = [];

  switch (card.kind) {
    case "money":
      header = "#2ed3a0";
      face = "#d9fbe9";
      title = `${card.value}M`;
      subtitle = "Money";
      break;
    case "property":
      header = COLOR_HEX[card.color];
      headerText = COLOR_TEXT[card.color];
      subtitle = "Property";
      rentColors = [card.color];
      break;
    case "wild": {
      const colors = card.colors === "any" ? DEAL_COLORS : card.colors;
      header = stripes(colors.map((c) => COLOR_HEX[c]));
      title = "Wild";
      subtitle =
        card.colors === "any" ? "Any color" : card.colors.map((c) => COLOR_NAMES[c]).join(" / ");
      if (card.colors !== "any") rentColors = [...card.colors];
      break;
    }
    case "rent":
      header = stripes(colorsOf(card).map((c) => COLOR_HEX[c]));
      title = card.colors === "any" ? "Wild rent" : "Rent";
      subtitle =
        card.colors === "any"
          ? "Any color, one player"
          : `${colorsOf(card)
              .map((c) => COLOR_NAMES[c])
              .join(" / ")}, everyone`;
      break;
    case "action":
      header = "#ff5fa2";
      face = "#fff0f6";
      title = ACTION_NAMES[card.action];
      subtitle = ACTION_TEXT[card.action];
      icon = ACTION_ICON[card.action];
      break;
  }

  // The tiny cards around the table: just the color (or icon / value), no text.
  if (size === "xs") {
    return (
      <div
        className={`relative flex shrink-0 items-center justify-center overflow-hidden border-ink font-black text-ink ${s.box} ${className}`}
        style={{
          background:
            card.kind === "property" || card.kind === "wild" || card.kind === "rent"
              ? header
              : face,
        }}
        role="img"
        aria-label={dealCardLabel(card)}
      >
        {card.kind === "money" && <span className={s.title}>{card.value}</span>}
        {card.kind === "action" && <span className={s.icon}>{icon}</span>}
      </div>
    );
  }

  const withRent = rentColors.length > 0;
  const body = (
    <>
      <span
        className={`w-full shrink-0 border-b-2 border-ink ${s.header}`}
        style={{ background: header, color: headerText }}
      />
      <span
        className={`flex flex-1 flex-col items-center gap-0.5 px-0.5 text-center ${withRent ? "justify-start pt-0.5" : "justify-center"}`}
      >
        {icon && (
          <span className={s.icon} aria-hidden>
            {icon}
          </span>
        )}
        <span
          className={`leading-tight font-extrabold break-words hyphens-auto ${s.title} ${card.kind === "money" ? (small ? "font-display text-[1.2em]" : "font-display text-[1.6em]") : ""} ${withRent ? "line-clamp-2" : ""}`}
        >
          {title}
        </span>
        {!small && subtitle && !withRent && (
          <span className="text-[0.55rem] leading-tight font-semibold text-ink/55">{subtitle}</span>
        )}
      </span>
      {withRent && (
        <span
          className={`flex w-full ${small ? "flex-col gap-0.5 px-0.5 pb-1" : "gap-1 px-1 pb-1.5"}`}
          title="Rent by number of cards in the set"
        >
          {rentColors.map((color) => (
            <span key={color} className="min-w-0 flex-1">
              <RentLadder color={color} small={small} dot={rentColors.length > 1} />
            </span>
          ))}
        </span>
      )}
      {card.value > 0 && (small || card.kind !== "money") && (
        <span
          className={`absolute top-0.5 left-0.5 rounded-full border border-ink bg-white font-black text-ink ${s.value}`}
        >
          {card.value}M
        </span>
      )}
    </>
  );
  const base = `relative flex shrink-0 flex-col overflow-hidden border-ink text-ink shadow-[2px_3px_0_var(--color-ink)] select-none ${s.box} ${
    selected ? "-translate-y-2 ring-4 ring-sunny" : active ? "ring-4 ring-sunny" : ""
  } ${className}`;

  if (!onClick) {
    return (
      <div
        className={base}
        style={{ background: face }}
        role="img"
        aria-label={dealCardLabel(card)}
      >
        {body}
      </div>
    );
  }
  return (
    <motion.button
      type="button"
      className={`${base} enabled:cursor-pointer disabled:opacity-60`}
      style={{ background: face }}
      onClick={onClick}
      disabled={disabled}
      aria-label={dealCardLabel(card)}
      aria-pressed={selected}
      data-testid="deal-card"
      data-active={active}
      whileHover={disabled ? {} : { y: -10, scale: 1.05 }}
      whileTap={disabled ? {} : { scale: 0.95 }}
    >
      {body}
    </motion.button>
  );
}

/** The back of a Monopoly Deal card. */
export function DealCardBack({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const small = size === "sm";
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden border-ink bg-ink shadow-[2px_3px_0_var(--color-ink)] ${SIZES[size].box} ${className}`}
      aria-hidden
    >
      <span className="absolute inset-1 rounded-[inherit] border-2 border-dashed border-white/25" />
      <span className="flex h-[62%] w-[80%] -rotate-[22deg] items-center justify-center rounded-[50%] border-2 border-white bg-gradient-to-br from-mint to-sky">
        <span
          className={`rotate-[22deg] font-display font-bold text-ink ${small ? "text-[0.5rem]" : "text-sm"}`}
        >
          DEAL
        </span>
      </span>
    </div>
  );
}
