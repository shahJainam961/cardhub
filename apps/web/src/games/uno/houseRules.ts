import type { UnoOptions } from "@cardhub/engine";

/** The on/off rule options; `Extract` fails to compile if one is renamed in the engine. */
export type HouseRuleKey = Extract<
  keyof UnoOptions,
  "stacking" | "sevenZero" | "jumpIn" | "drawUntilPlayable"
>;

export const HOUSE_RULES: { key: HouseRuleKey; name: string; description: string }[] = [
  {
    key: "stacking",
    name: "Stacking",
    description: "Answer a +2 or +4 with another one; the next player draws the total.",
  },
  {
    key: "sevenZero",
    name: "7-0",
    description: "A 7 swaps hands with a player you choose; a 0 passes every hand along.",
  },
  {
    key: "jumpIn",
    name: "Jump-in",
    description: "Play an identical card out of turn; play continues from you.",
  },
  {
    key: "drawUntilPlayable",
    name: "Draw until playable",
    description: "Keep drawing until you get a card you can play.",
  },
];
