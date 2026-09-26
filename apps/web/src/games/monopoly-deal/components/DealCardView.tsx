import { colorsOf, DEAL_COLORS, type DealCard } from "@cardhub/engine";
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
  sm: {
    box: "h-16 w-11 rounded-md border-2",
    header: "h-3.5",
    title: "text-[0.5rem]",
    icon: "text-sm",
    value: "text-[0.5rem] px-0.5",
  },
  md: {
    box: "h-28 w-20 rounded-xl border-[2.5px]",
    header: "h-6",
    title: "text-[0.72rem]",
    icon: "text-2xl",
    value: "text-[0.65rem] px-1",
  },
} as const;

interface DealCardViewProps {
  card: DealCard;
  onClick?: () => void;
  /** Highlighted as selectable / selected. */
  active?: boolean;
  selected?: boolean;
  disabled?: boolean;
  /** "sm" for cards laid on a table (banks and property stacks). */
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
      break;
    case "wild": {
      const colors = card.colors === "any" ? DEAL_COLORS : card.colors;
      header = stripes(colors.map((c) => COLOR_HEX[c]));
      title = "Wild";
      subtitle =
        card.colors === "any" ? "Any color" : card.colors.map((c) => COLOR_NAMES[c]).join(" / ");
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

  const body = (
    <>
      <span
        className={`w-full shrink-0 border-b-2 border-ink ${s.header}`}
        style={{ background: header, color: headerText }}
      />
      <span className="flex flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-center">
        {icon && (
          <span className={s.icon} aria-hidden>
            {icon}
          </span>
        )}
        <span
          className={`leading-tight font-extrabold break-words hyphens-auto ${s.title} ${card.kind === "money" ? (small ? "font-display text-[1.2em]" : "font-display text-[1.6em]") : ""}`}
        >
          {title}
        </span>
        {!small && subtitle && (
          <span className="text-[0.55rem] leading-tight font-semibold text-ink/55">{subtitle}</span>
        )}
      </span>
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
