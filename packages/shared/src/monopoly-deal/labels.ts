import { colorsOf, type ActionKind, type DealCard, type DealColor } from "@cardhub/engine";

export const COLOR_NAMES: Record<DealColor, string> = {
  brown: "Brown",
  lightBlue: "Light Blue",
  purple: "Purple",
  orange: "Orange",
  red: "Red",
  yellow: "Yellow",
  green: "Green",
  darkBlue: "Dark Blue",
  railroad: "Railroad",
  utility: "Utility",
};

export const ACTION_NAMES: Record<ActionKind, string> = {
  dealBreaker: "Deal Breaker",
  justSayNo: "Just Say No",
  slyDeal: "Sly Deal",
  forcedDeal: "Forced Deal",
  debtCollector: "Debt Collector",
  birthday: "It's My Birthday",
  passGo: "Pass Go",
  house: "House",
  hotel: "Hotel",
  doubleRent: "Double The Rent",
};

const colorList = (colors: readonly DealColor[]) => colors.map((c) => COLOR_NAMES[c]).join("/");

/** Short card name, e.g. "3M", "Boardwalk", "Red/Yellow wild", "Wild rent", "Sly Deal". */
export function dealCardLabel(card: DealCard): string {
  switch (card.kind) {
    case "money":
      return `${card.value}M`;
    case "property":
      return card.name;
    case "wild":
      return card.colors === "any" ? "Every-color wild" : `${colorList(card.colors)} wild`;
    case "rent":
      return card.colors === "any" ? "Wild rent" : `${colorList(colorsOf(card))} rent`;
    case "action":
      return ACTION_NAMES[card.action];
  }
}
