import type { UnoCard } from "@cardhub/engine";

const ACTION_NAMES = { skip: "Skip", reverse: "Reverse", drawTwo: "+2" } as const;

const capitalize = (word: string) => word[0]!.toUpperCase() + word.slice(1);

/** Human-readable card name, e.g. "Red 7", "Blue +2", "Wild +4". */
export function cardLabel(card: UnoCard): string {
  switch (card.kind) {
    case "number":
      return `${capitalize(card.color)} ${card.value}`;
    case "wild":
      return "Wild";
    case "wildDrawFour":
      return "Wild +4";
    default:
      return `${capitalize(card.color)} ${ACTION_NAMES[card.kind]}`;
  }
}
