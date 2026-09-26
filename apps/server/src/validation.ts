import { UNO_COLORS, type UnoColor, type UnoMove, type UnoOptions } from "@cardhub/engine";
import { UNO_BOT_LEVELS, type BotLevel } from "@cardhub/bots";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Accepts only well-formed moves; the engine then checks whether the move is legal. */
export function parseUnoMove(value: unknown): UnoMove | null {
  if (!isObject(value)) return null;
  if (value.type === "draw" || value.type === "pass") return { type: value.type };
  if (value.type !== "play" || typeof value.cardId !== "string") return null;

  const move: UnoMove = { type: "play", cardId: value.cardId };
  if (value.color !== undefined) {
    if (!UNO_COLORS.includes(value.color as UnoColor)) return null;
    move.color = value.color as UnoColor;
  }
  if (value.target !== undefined) {
    if (typeof value.target !== "string") return null;
    move.target = value.target;
  }
  if (value.uno !== undefined) {
    if (typeof value.uno !== "boolean") return null;
    move.uno = value.uno;
  }
  return move;
}

const HOUSE_RULES = ["stacking", "sevenZero", "jumpIn", "drawUntilPlayable"] as const;

/** Only the on/off house rules can be changed from a client. */
export function parseHouseRules(value: unknown): Partial<UnoOptions> {
  if (!isObject(value)) return {};
  const rules: Partial<UnoOptions> = {};
  for (const key of HOUSE_RULES) {
    if (typeof value[key] === "boolean") rules[key] = value[key];
  }
  return rules;
}

/** A bot level the game supports, defaulting to "normal". */
export function parseBotLevel(
  value: unknown,
  allowed: readonly BotLevel[] = UNO_BOT_LEVELS,
): BotLevel {
  const level = isObject(value) ? value.level : undefined;
  return allowed.includes(level as BotLevel) ? (level as BotLevel) : "normal";
}
