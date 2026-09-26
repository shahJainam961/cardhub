export const DEAL_COLORS = [
  "brown",
  "lightBlue",
  "purple",
  "orange",
  "red",
  "yellow",
  "green",
  "darkBlue",
  "railroad",
  "utility",
] as const;
export type DealColor = (typeof DEAL_COLORS)[number];

export interface ColorInfo {
  /** Cards needed for a complete set. */
  setSize: number;
  /** Rent for 1, 2, … cards in the set (index 0 = one card). */
  rent: readonly number[];
  /** Houses and hotels can't be built on railroads or utilities. */
  buildable: boolean;
}

export const COLOR_INFO: Record<DealColor, ColorInfo> = {
  brown: { setSize: 2, rent: [1, 2], buildable: true },
  lightBlue: { setSize: 3, rent: [1, 2, 3], buildable: true },
  purple: { setSize: 3, rent: [1, 2, 4], buildable: true },
  orange: { setSize: 3, rent: [1, 3, 5], buildable: true },
  red: { setSize: 3, rent: [2, 3, 6], buildable: true },
  yellow: { setSize: 3, rent: [2, 4, 6], buildable: true },
  green: { setSize: 3, rent: [2, 4, 7], buildable: true },
  darkBlue: { setSize: 2, rent: [3, 8], buildable: true },
  railroad: { setSize: 4, rent: [1, 2, 3, 4], buildable: false },
  utility: { setSize: 2, rent: [1, 2], buildable: false },
};

export const HOUSE_RENT = 3;
export const HOTEL_RENT = 4;
export const DEBT_COLLECTOR_AMOUNT = 5;
export const BIRTHDAY_AMOUNT = 2;

export type ActionKind =
  | "dealBreaker"
  | "justSayNo"
  | "slyDeal"
  | "forcedDeal"
  | "debtCollector"
  | "birthday"
  | "passGo"
  | "house"
  | "hotel"
  | "doubleRent";

export type MoneyCard = { id: string; kind: "money"; value: number };
export type PropertyCard = {
  id: string;
  kind: "property";
  color: DealColor;
  name: string;
  value: number;
};
/** `colors: "any"` is the every-color wild: worth nothing, can't complete a set on its own. */
export type WildCard = { id: string; kind: "wild"; colors: DealColor[] | "any"; value: number };
/** Two-color rent charges every other player; `"any"` (wild rent) charges one chosen player. */
export type RentCard = { id: string; kind: "rent"; colors: DealColor[] | "any"; value: number };
export type ActionCard = { id: string; kind: "action"; action: ActionKind; value: number };
export type DealCard = MoneyCard | PropertyCard | WildCard | RentCard | ActionCard;

/** Cards that live in a property collection. */
export type PlaceableCard = PropertyCard | WildCard;

const PROPERTIES: Record<DealColor, { value: number; names: string[] }> = {
  brown: { value: 1, names: ["Mediterranean Avenue", "Baltic Avenue"] },
  lightBlue: { value: 1, names: ["Oriental Avenue", "Vermont Avenue", "Connecticut Avenue"] },
  purple: { value: 2, names: ["St. Charles Place", "States Avenue", "Virginia Avenue"] },
  orange: { value: 2, names: ["St. James Place", "Tennessee Avenue", "New York Avenue"] },
  red: { value: 3, names: ["Kentucky Avenue", "Indiana Avenue", "Illinois Avenue"] },
  yellow: { value: 3, names: ["Atlantic Avenue", "Ventnor Avenue", "Marvin Gardens"] },
  green: { value: 4, names: ["Pacific Avenue", "North Carolina Avenue", "Pennsylvania Avenue"] },
  darkBlue: { value: 4, names: ["Park Place", "Boardwalk"] },
  railroad: {
    value: 2,
    names: ["Reading Railroad", "Pennsylvania Railroad", "B. & O. Railroad", "Short Line"],
  },
  utility: { value: 2, names: ["Electric Company", "Water Works"] },
};

const WILDS: { colors: DealColor[] | "any"; value: number; count: number }[] = [
  { colors: "any", value: 0, count: 2 },
  { colors: ["purple", "orange"], value: 2, count: 2 },
  { colors: ["lightBlue", "brown"], value: 1, count: 1 },
  { colors: ["lightBlue", "railroad"], value: 4, count: 1 },
  { colors: ["darkBlue", "green"], value: 4, count: 1 },
  { colors: ["railroad", "green"], value: 4, count: 1 },
  { colors: ["red", "yellow"], value: 3, count: 2 },
  { colors: ["utility", "railroad"], value: 2, count: 1 },
];

const RENTS: { colors: DealColor[] | "any"; value: number; count: number }[] = [
  { colors: ["brown", "lightBlue"], value: 1, count: 2 },
  { colors: ["purple", "orange"], value: 1, count: 2 },
  { colors: ["red", "yellow"], value: 1, count: 2 },
  { colors: ["darkBlue", "green"], value: 1, count: 2 },
  { colors: ["railroad", "utility"], value: 1, count: 2 },
  { colors: "any", value: 3, count: 3 },
];

/**
 * Official card counts aren't printed in the rulebook; Forced Deal ×3 and Hotel ×2 are the only
 * counts consistent with the 110-card box (106 playable + 4 reference cards). See RULES.md.
 */
const ACTIONS: { action: ActionKind; value: number; count: number }[] = [
  { action: "dealBreaker", value: 5, count: 2 },
  { action: "justSayNo", value: 4, count: 3 },
  { action: "slyDeal", value: 3, count: 3 },
  { action: "forcedDeal", value: 3, count: 3 },
  { action: "debtCollector", value: 3, count: 3 },
  { action: "birthday", value: 2, count: 3 },
  { action: "passGo", value: 1, count: 10 },
  { action: "house", value: 3, count: 3 },
  { action: "hotel", value: 4, count: 2 },
  { action: "doubleRent", value: 1, count: 2 },
];

const MONEY: { value: number; count: number }[] = [
  { value: 1, count: 6 },
  { value: 2, count: 5 },
  { value: 3, count: 3 },
  { value: 4, count: 3 },
  { value: 5, count: 2 },
  { value: 10, count: 1 },
];

export const DEAL_DECK_SIZE = 106;

/** The standard 106 playable cards. */
export function createDealDeck(): DealCard[] {
  const cards: DealCard[] = [];
  let next = 0;
  const id = () => `d${next++}`;

  for (const color of DEAL_COLORS) {
    const { value, names } = PROPERTIES[color];
    for (const name of names) cards.push({ id: id(), kind: "property", color, name, value });
  }
  for (const { colors, value, count } of WILDS) {
    for (let i = 0; i < count; i++) cards.push({ id: id(), kind: "wild", colors, value });
  }
  for (const { colors, value, count } of RENTS) {
    for (let i = 0; i < count; i++) cards.push({ id: id(), kind: "rent", colors, value });
  }
  for (const { action, value, count } of ACTIONS) {
    for (let i = 0; i < count; i++) cards.push({ id: id(), kind: "action", action, value });
  }
  for (const { value, count } of MONEY) {
    for (let i = 0; i < count; i++) cards.push({ id: id(), kind: "money", value });
  }
  return cards;
}

export function colorsOf(card: WildCard | RentCard): readonly DealColor[] {
  return card.colors === "any" ? DEAL_COLORS : card.colors;
}

export function isPlaceable(card: DealCard): card is PlaceableCard {
  return card.kind === "property" || card.kind === "wild";
}

export function isEveryColorWild(card: DealCard): boolean {
  return card.kind === "wild" && card.colors === "any";
}

export function isAction(card: DealCard, action: ActionKind): card is ActionCard {
  return card.kind === "action" && card.action === action;
}
