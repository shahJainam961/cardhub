import { createRng, type Rng } from "../../core/rng";
import type { GameDefinition, PlayerId, ValidationResult } from "../../core/types";
import {
  cardPoints,
  createUnoDeck,
  isIdentical,
  isWild,
  UNO_COLORS,
  type UnoCard,
  type UnoColor,
  type UnoNumberCard,
} from "./cards";

export interface UnoOptions {
  handSize: number;
  /** +2 on +2, and +4 on +2 or +4; the next player adds to the stack or draws the total. */
  stacking: boolean;
  /** Playing a 7 swaps hands with a chosen player; a 0 passes every hand along. */
  sevenZero: boolean;
  /** Anyone may play a card identical to the top card out of turn; play continues from them. */
  jumpIn: boolean;
  /** Keep drawing until a playable card turns up, instead of drawing one. */
  drawUntilPlayable: boolean;
  /** Cards drawn for going down to one card without declaring "UNO". */
  unoPenalty: number;
}

export const DEFAULT_UNO_OPTIONS: UnoOptions = {
  handSize: 7,
  stacking: false,
  sevenZero: false,
  jumpIn: false,
  drawUntilPlayable: false,
  unoPenalty: 2,
};

export interface UnoState {
  options: UnoOptions;
  players: PlayerId[];
  hands: Record<PlayerId, UnoCard[]>;
  /** Cards are drawn from the end. */
  drawPile: UnoCard[];
  /** The last card is the top card. */
  discardPile: UnoCard[];
  currentColor: UnoColor;
  currentIndex: number;
  direction: 1 | -1;
  /** Stacked +2/+4 cards the current player must answer (stacking only). */
  pendingDraw: number;
  /** Set when the current player has drawn a playable card: they may play it or pass. */
  drawnCardId: string | null;
  winner: PlayerId | null;
  rngState: number;
}

export type UnoMove =
  | {
      type: "play";
      cardId: string;
      /** Required for wild cards. */
      color?: UnoColor;
      /** Required for a 7 when `sevenZero` is on (the player to swap hands with). */
      target?: PlayerId;
      /** Declare "UNO" when this play leaves you with one card. */
      uno?: boolean;
    }
  | { type: "draw" }
  | { type: "pass" };

export interface UnoView {
  me: PlayerId | null;
  hand: UnoCard[];
  players: { id: PlayerId; cardCount: number }[];
  topCard: UnoCard;
  currentColor: UnoColor;
  currentPlayer: PlayerId;
  direction: 1 | -1;
  pendingDraw: number;
  drawPileCount: number;
  /** Whether the current player has drawn and is deciding to play the drawn card or pass. */
  hasDrawn: boolean;
  /** Only visible to the player who drew it. */
  drawnCardId: string | null;
  winner: PlayerId | null;
  options: UnoOptions;
}

const OK: ValidationResult = { ok: true };
const fail = (reason: string): ValidationResult => ({ ok: false, reason });

function handOf(s: UnoState, player: PlayerId): UnoCard[] {
  const hand = s.hands[player];
  if (!hand) throw new Error(`Unknown player ${player}`);
  return hand;
}

function topCard(s: UnoState): UnoCard {
  const top = s.discardPile[s.discardPile.length - 1];
  if (!top) throw new Error("Discard pile is empty");
  return top;
}

function currentPlayer(s: UnoState): PlayerId {
  return s.players[s.currentIndex]!;
}

function indexAfter(s: UnoState, from: number, steps: number): number {
  const n = s.players.length;
  return (((from + s.direction * steps) % n) + n) % n;
}

/** Ends the current turn, skipping `skip` extra players. */
function endTurn(s: UnoState, skip = 0): void {
  s.drawnCardId = null;
  s.currentIndex = indexAfter(s, s.currentIndex, 1 + skip);
}

function canPlay(s: UnoState, card: UnoCard): boolean {
  const top = topCard(s);
  if (s.pendingDraw > 0) {
    if (card.kind === "wildDrawFour") return true;
    return card.kind === "drawTwo" && top.kind === "drawTwo";
  }
  if (isWild(card)) return true;
  if (card.color === s.currentColor) return true;
  if (card.kind === "number") return top.kind === "number" && top.value === card.value;
  return card.kind === top.kind;
}

/** A 7 or 0 that moves hands around under the 7-0 rule. */
function movesHands(s: UnoState, card: UnoCard): boolean {
  return s.options.sevenZero && card.kind === "number" && (card.value === 7 || card.value === 0);
}

/** Draws up to `count` cards, reshuffling the discard pile (minus its top card) when needed. */
function drawCards(s: UnoState, rng: Rng, player: PlayerId, count: number): UnoCard[] {
  const hand = handOf(s, player);
  const drawn: UnoCard[] = [];
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0 && s.discardPile.length > 1) {
      const top = s.discardPile.pop()!;
      s.drawPile = rng.shuffle(s.discardPile);
      s.discardPile = [top];
    }
    const card = s.drawPile.pop();
    if (!card) break;
    hand.push(card);
    drawn.push(card);
  }
  return drawn;
}

function validateMove(s: UnoState, player: PlayerId, move: UnoMove): ValidationResult {
  if (s.winner) return fail("the game is over");
  const index = s.players.indexOf(player);
  if (index < 0) return fail("you are not in this game");
  const isTurn = index === s.currentIndex;

  switch (move.type) {
    case "draw":
      if (!isTurn) return fail("it is not your turn");
      if (s.drawnCardId) return fail("you already drew this turn");
      return OK;

    case "pass":
      if (!isTurn) return fail("it is not your turn");
      if (!s.drawnCardId) return fail("you can only pass after drawing a card");
      return OK;

    case "play": {
      const hand = handOf(s, player);
      const card = hand.find((c) => c.id === move.cardId);
      if (!card) return fail("that card is not in your hand");

      if (!isTurn) {
        if (!s.options.jumpIn) return fail("it is not your turn");
        if (s.pendingDraw > 0) return fail("you cannot jump in while a draw is pending");
        if (!isIdentical(card, topCard(s))) return fail("jumping in needs an identical card");
      } else {
        if (s.drawnCardId && card.id !== s.drawnCardId) {
          return fail("after drawing you may only play the card you drew");
        }
        if (!canPlay(s, card)) return fail("that card does not match");
      }

      if (isWild(card)) {
        if (!move.color) return fail("choose a color for the wild card");
      } else if (move.color !== undefined) {
        return fail("only wild cards take a color");
      }

      const swaps = s.options.sevenZero && card.kind === "number" && card.value === 7;
      if (swaps && hand.length > 1) {
        if (!move.target || move.target === player || !s.players.includes(move.target)) {
          return fail("choose another player to swap hands with");
        }
      } else if (move.target !== undefined) {
        return fail("this card does not take a target");
      }
      return OK;
    }
  }
}

function applyDraw(s: UnoState, rng: Rng, player: PlayerId): void {
  if (s.pendingDraw > 0) {
    drawCards(s, rng, player, s.pendingDraw);
    s.pendingDraw = 0;
    endTurn(s);
    return;
  }
  let drawn = drawCards(s, rng, player, 1)[0];
  if (s.options.drawUntilPlayable) {
    while (drawn && !canPlay(s, drawn)) drawn = drawCards(s, rng, player, 1)[0];
  }
  if (drawn && canPlay(s, drawn)) {
    s.drawnCardId = drawn.id;
  } else {
    endTurn(s);
  }
}

function applyPlay(s: UnoState, rng: Rng, index: number, move: UnoMove & { type: "play" }): void {
  const player = s.players[index]!;
  const hand = handOf(s, player);
  const card = hand.splice(
    hand.findIndex((c) => c.id === move.cardId),
    1,
  )[0]!;
  s.discardPile.push(card);
  s.currentColor = isWild(card) ? move.color! : card.color;
  // A jump-in takes over the turn from the current player.
  s.currentIndex = index;
  s.drawnCardId = null;

  if (hand.length === 0) {
    s.winner = player;
    return;
  }
  // No UNO obligation when a 7 or 0 is about to hand this hand to someone else.
  if (hand.length === 1 && !move.uno && !movesHands(s, card)) {
    drawCards(s, rng, player, s.options.unoPenalty);
  }

  switch (card.kind) {
    case "skip":
      endTurn(s, 1);
      return;
    case "reverse":
      if (s.players.length === 2) {
        endTurn(s, 1);
      } else {
        s.direction = s.direction === 1 ? -1 : 1;
        endTurn(s);
      }
      return;
    case "drawTwo":
    case "wildDrawFour": {
      const amount = card.kind === "drawTwo" ? 2 : 4;
      if (s.options.stacking) {
        s.pendingDraw += amount;
        endTurn(s);
      } else {
        endTurn(s);
        drawCards(s, rng, currentPlayer(s), amount);
        endTurn(s);
      }
      return;
    }
    case "number":
      if (s.options.sevenZero && card.value === 7) {
        const target = move.target!;
        const theirs = handOf(s, target);
        s.hands[target] = hand;
        s.hands[player] = theirs;
      } else if (s.options.sevenZero && card.value === 0) {
        const hands = s.players.map((p) => handOf(s, p));
        s.players.forEach((_, i) => {
          s.hands[s.players[indexAfter(s, i, 1)]!] = hands[i]!;
        });
      }
      endTurn(s);
      return;
    case "wild":
      endTurn(s);
      return;
  }
}

export const uno: GameDefinition<UnoState, UnoMove, UnoView, UnoOptions> = {
  id: "uno",
  name: "Uno",
  minPlayers: 2,
  maxPlayers: 10,
  defaultOptions: DEFAULT_UNO_OPTIONS,

  setup({ players, options, seed }) {
    if (!Number.isInteger(options.handSize) || options.handSize < 1) {
      throw new RangeError("handSize must be a positive integer");
    }
    if (options.handSize * players.length > 100) {
      throw new RangeError("Not enough cards to deal that many players and cards");
    }
    if (!Number.isInteger(options.unoPenalty) || options.unoPenalty < 0) {
      throw new RangeError("unoPenalty must be a non-negative integer");
    }

    const rng = createRng(seed);
    const drawPile = rng.shuffle(createUnoDeck());
    const hands: Record<PlayerId, UnoCard[]> = {};
    for (const player of players) {
      hands[player] = drawPile.splice(drawPile.length - options.handSize, options.handSize);
    }
    // The first discard is always a number card; action and wild cards stay in the pile.
    const startIndex = drawPile.findIndex((c): c is UnoNumberCard => c.kind === "number");
    const start = drawPile.splice(startIndex, 1)[0] as UnoNumberCard;

    return {
      options: { ...options },
      players: [...players],
      hands,
      drawPile,
      discardPile: [start],
      currentColor: start.color,
      currentIndex: 0,
      direction: 1,
      pendingDraw: 0,
      drawnCardId: null,
      winner: null,
      rngState: rng.state,
    };
  },

  activePlayers(s) {
    if (s.winner) return [];
    const current = currentPlayer(s);
    if (!s.options.jumpIn || s.pendingDraw > 0) return [current];
    const top = topCard(s);
    const jumpers = s.players.filter(
      (p) => p !== current && handOf(s, p).some((c) => isIdentical(c, top)),
    );
    return [current, ...jumpers];
  },

  legalMoves(s, player) {
    if (s.winner || !s.players.includes(player)) return [];
    const hand = handOf(s, player);
    const others = s.players.filter((p) => p !== player);
    const candidates: UnoMove[] = [{ type: "draw" }, { type: "pass" }];

    for (const card of hand) {
      const colors = isWild(card) ? UNO_COLORS : [undefined];
      const swaps = s.options.sevenZero && card.kind === "number" && card.value === 7;
      const targets = swaps && hand.length > 1 ? others : [undefined];
      for (const color of colors) {
        for (const target of targets) {
          candidates.push({
            type: "play",
            cardId: card.id,
            ...(color ? { color } : {}),
            ...(target ? { target } : {}),
            ...(hand.length === 2 ? { uno: true } : {}),
          });
        }
      }
    }
    return candidates.filter((m) => validateMove(s, player, m).ok);
  },

  validateMove,

  applyMove(state, player, move) {
    const s = structuredClone(state);
    const rng = createRng(s.rngState);
    switch (move.type) {
      case "draw":
        applyDraw(s, rng, player);
        break;
      case "pass":
        endTurn(s);
        break;
      case "play":
        applyPlay(s, rng, s.players.indexOf(player), move);
        break;
    }
    s.rngState = rng.state;
    return s;
  },

  playerView(s, player) {
    const isMe = player !== null && player === currentPlayer(s);
    return {
      me: player,
      hand: player && s.hands[player] ? structuredClone(s.hands[player]) : [],
      players: s.players.map((id) => ({ id, cardCount: handOf(s, id).length })),
      topCard: { ...topCard(s) },
      currentColor: s.currentColor,
      currentPlayer: currentPlayer(s),
      direction: s.direction,
      pendingDraw: s.pendingDraw,
      drawPileCount: s.drawPile.length,
      hasDrawn: s.drawnCardId !== null,
      drawnCardId: isMe ? s.drawnCardId : null,
      winner: s.winner,
      options: { ...s.options },
    };
  },

  result(s) {
    if (!s.winner) return null;
    const points = s.players
      .filter((p) => p !== s.winner)
      .reduce((sum, p) => sum + handOf(s, p).reduce((acc, c) => acc + cardPoints(c), 0), 0);
    return { outcome: "win", winners: [s.winner], scores: { [s.winner]: points } };
  },
};
