import {
  DEAL_COLORS,
  UNO_COLORS,
  type DealColor,
  type MonopolyDealMove,
  type UnoColor,
  type UnoMove,
  type UnoOptions,
} from "@cardhub/engine";
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

const MAX_ID_LENGTH = 64;
const MAX_LIST = 120;

const isId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
const isColor = (value: unknown): value is DealColor => DEAL_COLORS.includes(value as DealColor);
const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_LIST && value.every(isId);

/**
 * Accepts only well-formed Monopoly Deal moves, rebuilt from their known fields (anything extra is
 * dropped); the engine then checks whether the move is legal.
 */
export function parseDealMove(value: unknown): MonopolyDealMove | null {
  if (!isObject(value)) return null;
  const v = value;
  switch (v.type) {
    case "endTurn":
    case "accept":
      return { type: v.type };
    case "discard":
    case "pay":
      return isIdList(v.cardIds) ? { type: v.type, cardIds: [...v.cardIds] } : null;
  }
  if (!isId(v.cardId)) return null;
  const cardId = v.cardId;
  switch (v.type) {
    case "bank":
    case "passGo":
    case "birthday":
    case "justSayNo":
      return { type: v.type, cardId };
    case "property":
    case "moveWild":
    case "building":
      return isColor(v.color) ? { type: v.type, cardId, color: v.color } : null;
    case "rent": {
      if (!isColor(v.color)) return null;
      if (v.target !== undefined && !isId(v.target)) return null;
      if (v.doubles !== undefined && !isIdList(v.doubles)) return null;
      return {
        type: "rent",
        cardId,
        color: v.color,
        ...(v.target !== undefined ? { target: v.target as string } : {}),
        ...(v.doubles !== undefined ? { doubles: [...(v.doubles as string[])] } : {}),
      };
    }
    case "debtCollector":
      return isId(v.target) ? { type: "debtCollector", cardId, target: v.target } : null;
    case "slyDeal":
      return isId(v.targetCardId)
        ? { type: "slyDeal", cardId, targetCardId: v.targetCardId }
        : null;
    case "forcedDeal":
      return isId(v.offeredCardId) && isId(v.targetCardId)
        ? {
            type: "forcedDeal",
            cardId,
            offeredCardId: v.offeredCardId,
            targetCardId: v.targetCardId,
          }
        : null;
    case "dealBreaker":
      return isId(v.target) && isColor(v.color)
        ? { type: "dealBreaker", cardId, target: v.target, color: v.color }
        : null;
    default:
      return null;
  }
}
