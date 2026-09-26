import {
  isWild,
  UNO_COLORS,
  type Rng,
  type UnoCard,
  type UnoColor,
  type UnoMove,
  type UnoView,
} from "@cardhub/engine";
import type { BotLevel } from "./types";

type PlayMove = UnoMove & { type: "play" };

const ATTACKS = new Set<UnoCard["kind"]>(["skip", "reverse", "drawTwo", "wildDrawFour"]);

/** How often an easy bot forgets to declare UNO. */
const EASY_FORGETS_UNO = 0.3;

/** Whether a bot holding an identical card jumps in (jump-in variant). */
export function unoBotWantsToJumpIn(level: BotLevel, rng: Rng): boolean {
  return level === "normal" || rng.next() < 0.5;
}

/**
 * Picks a move from `legalMoves` using only what the bot's player view shows.
 * `legalMoves` must be non-empty and belong to the player the view was built for.
 */
export function chooseUnoMove(
  view: UnoView,
  legalMoves: UnoMove[],
  level: BotLevel,
  rng: Rng,
): UnoMove {
  if (legalMoves.length === 0) throw new Error("Bot has no legal moves");
  const plays = legalMoves.filter((m): m is PlayMove => m.type === "play");
  const fallback = legalMoves.find((m) => m.type === "draw") ?? legalMoves[0]!;
  if (plays.length === 0) return fallback;

  return level === "easy" ? chooseEasy(plays, rng) : chooseNormal(view, plays, rng);
}

function chooseEasy(plays: PlayMove[], rng: Rng): UnoMove {
  const move = plays[rng.int(plays.length)]!;
  if (move.uno && rng.next() < EASY_FORGETS_UNO) {
    const { uno: _forgotten, ...rest } = move;
    return rest;
  }
  return move;
}

function chooseNormal(view: UnoView, plays: PlayMove[], rng: Rng): UnoMove {
  const hand = new Map(view.hand.map((c) => [c.id, c]));
  const nextPlayerCards = cardsOfNextPlayer(view);
  const favorite = favoriteColor(view.hand, rng);

  const score = (card: UnoCard): number => {
    let points = isWild(card) ? (card.kind === "wildDrawFour" ? 0 : 1) : 10;
    if (ATTACKS.has(card.kind) && nextPlayerCards <= 2) points += 20;
    if (!isWild(card) && card.color === favorite) points += 2;
    if (!isWild(card) && card.kind !== "number") points += 1;
    return points + rng.next() * 0.5;
  };

  const cardIds = [...new Set(plays.map((m) => m.cardId))];
  const best = cardIds
    .map((id) => ({ id, score: score(hand.get(id)!) }))
    .sort((a, b) => b.score - a.score)[0]!.id;
  const options = plays.filter((m) => m.cardId === best);

  const bestColor = favoriteColor(
    view.hand.filter((c) => c.id !== best),
    rng,
  );
  const fewestCards = [...view.players]
    .filter((p) => p.id !== view.me)
    .sort((a, b) => a.cardCount - b.cardCount)[0]?.id;

  return (
    options.find(
      (m) => (!m.color || m.color === bestColor) && (!m.target || m.target === fewestCards),
    ) ?? options[0]!
  );
}

function cardsOfNextPlayer(view: UnoView): number {
  const index = view.players.findIndex((p) => p.id === view.currentPlayer);
  const n = view.players.length;
  const next = view.players[(((index + view.direction) % n) + n) % n];
  return next?.cardCount ?? Infinity;
}

function favoriteColor(cards: UnoCard[], rng: Rng): UnoColor {
  const counts = new Map<UnoColor, number>();
  for (const card of cards) {
    if (!isWild(card)) counts.set(card.color, (counts.get(card.color) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] ?? UNO_COLORS[rng.int(UNO_COLORS.length)]!;
}
