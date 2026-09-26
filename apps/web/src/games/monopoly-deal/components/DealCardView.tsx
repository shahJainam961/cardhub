import { colorsOf, DEAL_COLORS, type DealCard } from "@cardhub/engine";
import { ACTION_NAMES, COLOR_NAMES, dealCardLabel } from "@cardhub/shared";
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

function stripes(colors: readonly string[]): string {
  const step = 100 / colors.length;
  return `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(", ")})`;
}

interface DealCardViewProps {
  card: DealCard;
  onClick?: () => void;
  /** Highlighted as selectable / selected. */
  active?: boolean;
  selected?: boolean;
  disabled?: boolean;
}

/** A Monopoly Deal card: colored header, name, and its bank value in the corner. */
export function DealCardView({
  card,
  onClick,
  active = false,
  selected = false,
  disabled = false,
}: DealCardViewProps) {
  let header: string;
  let headerText = "#0f172a";
  let title = dealCardLabel(card);
  let subtitle = "";

  switch (card.kind) {
    case "money":
      header = "#bbf7d0";
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
      header = "#fecdd3";
      title = ACTION_NAMES[card.action];
      subtitle = ACTION_TEXT[card.action];
      break;
  }

  const body = (
    <>
      <span className="h-5 w-full rounded-t-md" style={{ background: header, color: headerText }} />
      <span className="flex flex-1 flex-col items-center justify-center px-1 text-center">
        <span className="text-[0.7rem] leading-tight font-bold break-words hyphens-auto">
          {title}
        </span>
        <span className="mt-0.5 text-[0.55rem] leading-tight text-slate-500">{subtitle}</span>
      </span>
      {card.value > 0 && (
        <span className="absolute top-0.5 left-1 rounded-full bg-white/90 px-1 text-[0.6rem] font-black text-slate-900">
          {card.value}M
        </span>
      )}
    </>
  );
  const base = `relative flex h-24 w-16 shrink-0 flex-col overflow-hidden rounded-lg bg-white text-slate-900 shadow-md ${
    selected ? "ring-4 ring-amber-400 -translate-y-2" : active ? "ring-2 ring-amber-300" : ""
  }`;

  if (!onClick) {
    return (
      <div className={base} role="img" aria-label={dealCardLabel(card)}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${base} transition-transform enabled:cursor-pointer enabled:hover:-translate-y-1 disabled:opacity-50`}
      onClick={onClick}
      disabled={disabled}
      aria-label={dealCardLabel(card)}
      aria-pressed={selected}
      data-testid="deal-card"
      data-active={active}
    >
      {body}
    </button>
  );
}
