import {
  COLOR_INFO,
  DEAL_COLORS,
  HOTEL_RENT,
  HOUSE_RENT,
  isEveryColorWild,
  type ActionCard,
  type DealCard,
  type DealColor,
  type PlaceableCard,
} from "./cards";

/** A property or wild card in a player's collection, counted as `color`. */
export interface TableProperty {
  card: PlaceableCard;
  color: DealColor;
}

/** A house or hotel standing on one of the player's complete sets of `color`. */
export interface Building {
  card: ActionCard;
  color: DealColor;
}

export interface PlayerTable {
  /** Money, plus action cards placed as money (and houses/hotels received as payment). */
  bank: DealCard[];
  properties: TableProperty[];
  buildings: Building[];
}

export interface SetInfo {
  /** Cards counted as this color. */
  total: number;
  /** Complete sets of this color. Every set needs at least one card that isn't an every-color wild. */
  complete: number;
  /** Cards counted for rent: 0 when only every-color wilds are present (they can't charge rent). */
  rentCount: number;
}

export function propertiesOf(table: PlayerTable, color: DealColor): TableProperty[] {
  return table.properties.filter((p) => p.color === color);
}

export function setInfo(table: PlayerTable, color: DealColor): SetInfo {
  const group = propertiesOf(table, color);
  const total = group.length;
  const real = group.filter((p) => !isEveryColorWild(p.card)).length;
  const { setSize } = COLOR_INFO[color];
  return {
    total,
    complete: real === 0 ? 0 : Math.min(Math.floor(total / setSize), real),
    rentCount: real === 0 ? 0 : Math.min(total, setSize),
  };
}

/** Distinct colors with at least one complete set (what counts toward winning). */
export function completeColors(table: PlayerTable): DealColor[] {
  return DEAL_COLORS.filter((color) => setInfo(table, color).complete > 0);
}

export function buildingsOn(
  table: PlayerTable,
  color: DealColor,
  action: "house" | "hotel",
): number {
  return table.buildings.filter((b) => b.color === color && b.card.action === action).length;
}

/** Rent one rent card collects for `color`: best set, plus its house and hotel if it has them. */
export function rentFor(table: PlayerTable, color: DealColor): number {
  const { rentCount, complete } = setInfo(table, color);
  if (rentCount === 0) return 0;
  let rent = COLOR_INFO[color].rent[rentCount - 1]!;
  if (complete > 0 && buildingsOn(table, color, "house") > 0) rent += HOUSE_RENT;
  if (complete > 0 && buildingsOn(table, color, "hotel") > 0) rent += HOTEL_RENT;
  return rent;
}

/** Sly Deal / Forced Deal may only take a card whose removal doesn't break a complete set. */
export function canTakeProperty(table: PlayerTable, cardId: string): boolean {
  const entry = table.properties.find((p) => p.card.id === cardId);
  if (!entry) return false;
  const before = setInfo(table, entry.color).complete;
  const after = setInfo(
    { ...table, properties: table.properties.filter((p) => p !== entry) },
    entry.color,
  ).complete;
  return after === before;
}

/**
 * Houses and hotels only stand on complete sets (not railroads/utilities), one of each per set,
 * hotel only with a house. Anything left without a complete set is discarded (official rule).
 */
export function removeInvalidBuildings(table: PlayerTable, discardPile: DealCard[]): void {
  for (const color of DEAL_COLORS) {
    const { complete } = setInfo(table, color);
    const allowedHouses = COLOR_INFO[color].buildable ? complete : 0;
    const houses = table.buildings.filter((b) => b.color === color && b.card.action === "house");
    const keptHouses = Math.min(houses.length, allowedHouses);
    const hotels = table.buildings.filter((b) => b.color === color && b.card.action === "hotel");
    const excess = [
      ...houses.slice(keptHouses),
      ...hotels.slice(Math.min(hotels.length, keptHouses)),
    ];
    if (excess.length === 0) continue;
    table.buildings = table.buildings.filter((b) => !excess.includes(b));
    discardPile.push(...excess.map((b) => b.card));
  }
}

/**
 * Removes one complete set of `color` for a Deal Breaker. Real properties are taken first, so the
 * victim keeps their flexible wild cards when they have extras; the set's house and hotel go too.
 */
export function takeCompleteSet(
  table: PlayerTable,
  color: DealColor,
): { properties: TableProperty[]; buildings: Building[] } {
  const rank = (p: TableProperty) =>
    p.card.kind === "property" ? 0 : isEveryColorWild(p.card) ? 2 : 1;
  const taken = propertiesOf(table, color)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, COLOR_INFO[color].setSize);
  const buildings = (["house", "hotel"] as const).flatMap((action) =>
    table.buildings.filter((b) => b.color === color && b.card.action === action).slice(0, 1),
  );
  table.properties = table.properties.filter((p) => !taken.includes(p));
  table.buildings = table.buildings.filter((b) => !buildings.includes(b));
  return { properties: taken, buildings };
}

export type PaymentSource = "bank" | "property" | "building";

export interface PayableCard {
  card: DealCard;
  source: PaymentSource;
}

/** Cards on the table that can pay a debt. Every-color wilds are worth nothing, so they can't. */
export function payableCards(table: PlayerTable): PayableCard[] {
  return [
    ...table.bank.map((card) => ({ card, source: "bank" as const })),
    ...table.buildings.map((b) => ({ card: b.card, source: "building" as const })),
    ...table.properties.map((p) => ({ card: p.card as DealCard, source: "property" as const })),
  ].filter((p) => p.card.value > 0);
}

export function totalValue(cards: readonly { card: DealCard }[]): number {
  return cards.reduce((sum, c) => sum + c.card.value, 0);
}

/**
 * A payment is valid when it covers the debt without any unnecessary card (there's no change, but
 * you can't throw in extras), or when it's everything you have and that still falls short.
 */
export function isValidPayment(
  table: PlayerTable,
  amount: number,
  cardIds: readonly string[],
): boolean {
  if (new Set(cardIds).size !== cardIds.length) return false;
  const payable = payableCards(table);
  const chosen = cardIds.map((id) => payable.find((p) => p.card.id === id));
  if (chosen.some((c) => !c)) return false;
  const paid = totalValue(chosen as PayableCard[]);
  if (paid < amount) return chosen.length === payable.length;
  const smallest = Math.min(...(chosen as PayableCard[]).map((c) => c.card.value));
  return paid - smallest < amount;
}

/**
 * Suggested payments (for bots and as the UI default): greedy in different orders, then trimmed so
 * no card is unnecessary. Only used when the debt is less than everything the player has.
 */
export function suggestPayments(table: PlayerTable, amount: number): string[][] {
  const payable = payableCards(table);
  const inCompleteSet = (p: PayableCard) =>
    p.source === "property" && !canTakeProperty(table, p.card.id);
  const asc = (a: PayableCard, b: PayableCard) => a.card.value - b.card.value;
  const orders: PayableCard[][] = [
    // Cheapest money first, keep properties (especially complete sets) as long as possible.
    [
      ...payable.filter((p) => p.source === "bank").sort(asc),
      ...payable.filter((p) => p.source === "building").sort(asc),
      ...payable.filter((p) => p.source === "property" && !inCompleteSet(p)).sort(asc),
      ...payable.filter(inCompleteSet).sort(asc),
    ],
    // Fewest cards: biggest money first.
    [
      ...payable.filter((p) => p.source === "bank").sort((a, b) => -asc(a, b)),
      ...payable.filter((p) => p.source !== "bank").sort(asc),
    ],
  ];

  const results = new Map<string, string[]>();
  for (const order of orders) {
    const picked: PayableCard[] = [];
    for (const card of order) {
      if (totalValue(picked) >= amount) break;
      picked.push(card);
    }
    // Drop cards that aren't needed, most valuable first.
    for (const card of [...picked].sort((a, b) => -asc(a, b))) {
      if (totalValue(picked) - card.card.value >= amount) picked.splice(picked.indexOf(card), 1);
    }
    const ids = picked.map((p) => p.card.id);
    if (isValidPayment(table, amount, ids)) results.set([...ids].sort().join(","), ids);
  }
  return [...results.values()];
}
