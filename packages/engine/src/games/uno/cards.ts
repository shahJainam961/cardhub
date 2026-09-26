export const UNO_COLORS = ["red", "yellow", "green", "blue"] as const;
export type UnoColor = (typeof UNO_COLORS)[number];

export type UnoNumberCard = { id: string; kind: "number"; color: UnoColor; value: number };
export type UnoActionCard = { id: string; kind: "skip" | "reverse" | "drawTwo"; color: UnoColor };
export type UnoWildCard = { id: string; kind: "wild" | "wildDrawFour" };
export type UnoCard = UnoNumberCard | UnoActionCard | UnoWildCard;

/** The standard 108-card deck. */
export function createUnoDeck(): UnoCard[] {
  const cards: UnoCard[] = [];
  let next = 0;
  const id = () => `c${next++}`;

  for (const color of UNO_COLORS) {
    cards.push({ id: id(), kind: "number", color, value: 0 });
    for (let copy = 0; copy < 2; copy++) {
      for (let value = 1; value <= 9; value++) {
        cards.push({ id: id(), kind: "number", color, value });
      }
      for (const kind of ["skip", "reverse", "drawTwo"] as const) {
        cards.push({ id: id(), kind, color });
      }
    }
  }
  for (let copy = 0; copy < 4; copy++) {
    cards.push({ id: id(), kind: "wild" });
    cards.push({ id: id(), kind: "wildDrawFour" });
  }
  return cards;
}

export function isWild(card: UnoCard): card is UnoWildCard {
  return card.kind === "wild" || card.kind === "wildDrawFour";
}

/** Same color and face (used by jump-in). Wild cards are never identical. */
export function isIdentical(a: UnoCard, b: UnoCard): boolean {
  if (isWild(a) || isWild(b) || a.kind !== b.kind || a.color !== b.color) return false;
  return a.kind !== "number" || (b.kind === "number" && a.value === b.value);
}

/** Standard scoring: face value for numbers, 20 for actions, 50 for wilds. */
export function cardPoints(card: UnoCard): number {
  if (card.kind === "number") return card.value;
  return isWild(card) ? 50 : 20;
}
