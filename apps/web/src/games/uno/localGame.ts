import { chooseUnoMove, unoBotWantsToJumpIn, type BotLevel } from "@cardhub/bots";
import {
  createRng,
  playMove,
  startGame,
  uno,
  type PlayerId,
  type UnoMove,
  type UnoOptions,
  type UnoState,
} from "@cardhub/engine";
import { cardLabel } from "./cardLabel";

export interface Seat {
  id: PlayerId;
  name: string;
  kind: "human" | "bot";
  /** Only used when `kind` is "bot". */
  level: BotLevel;
}

/** A game played on this device: pass-and-play humans and/or bots. */
export interface LocalUnoGame {
  seats: Seat[];
  seed: number;
  botDelayMs: number;
  state: UnoState;
  moveCount: number;
  log: string[];
  /** The human whose hand is on screen. With several humans it changes at each handoff. */
  revealedFor: PlayerId | null;
}

const MAX_LOG = 50;

export function createLocalUnoGame(
  seats: Seat[],
  options: Partial<UnoOptions>,
  { seed, botDelayMs }: { seed: number; botDelayMs: number },
): LocalUnoGame {
  const state = startGame(uno, { players: seats.map((s) => s.id), options, seed });
  const humans = seats.filter((s) => s.kind === "human");
  return {
    seats,
    seed,
    botDelayMs,
    state,
    moveCount: 0,
    log: [],
    revealedFor: humans.length === 1 ? humans[0]!.id : null,
  };
}

export function seatOf(game: LocalUnoGame, player: PlayerId): Seat {
  const seat = game.seats.find((s) => s.id === player);
  if (!seat) throw new Error(`Unknown seat ${player}`);
  return seat;
}

export function currentPlayer(state: UnoState): PlayerId {
  return state.players[state.currentIndex]!;
}

/** The human who must take the device before their hand is shown, if any. */
export function pendingHandoff(game: LocalUnoGame): PlayerId | null {
  if (uno.result(game.state)) return null;
  const humans = game.seats.filter((s) => s.kind === "human");
  if (humans.length < 2) return null;
  const current = currentPlayer(game.state);
  return seatOf(game, current).kind === "human" && game.revealedFor !== current ? current : null;
}

export function revealHand(game: LocalUnoGame, player: PlayerId): LocalUnoGame {
  return { ...game, revealedFor: player };
}

/** Validates and applies a move (throws `InvalidMoveError` when illegal). */
export function applyLocalMove(game: LocalUnoGame, player: PlayerId, move: UnoMove): LocalUnoGame {
  const state = playMove(uno, game.state, player, move);
  return {
    ...game,
    state,
    moveCount: game.moveCount + 1,
    log: [...game.log, describeMove(game, player, move, state)].slice(-MAX_LOG),
  };
}

/** The next move a bot wants to make, or `null` when it is a human's turn. */
export function nextBotAction(game: LocalUnoGame): { player: PlayerId; move: UnoMove } | null {
  const { state } = game;
  if (uno.result(state)) return null;
  const rng = createRng((game.seed ^ Math.imul(game.moveCount + 1, 0x9e3779b1)) >>> 0);
  const decide = (player: PlayerId) => ({
    player,
    move: chooseUnoMove(
      uno.playerView(state, player),
      uno.legalMoves(state, player),
      seatOf(game, player).level,
      rng,
    ),
  });

  const current = currentPlayer(state);
  for (const player of uno.activePlayers(state)) {
    const seat = seatOf(game, player);
    if (player !== current && seat.kind === "bot" && unoBotWantsToJumpIn(seat.level, rng)) {
      return decide(player);
    }
  }
  return seatOf(game, current).kind === "bot" ? decide(current) : null;
}

export function describeMove(
  game: LocalUnoGame,
  player: PlayerId,
  move: UnoMove,
  after: UnoState,
): string {
  const before = game.state;
  const name = seatOf(game, player).name;
  const handBefore = before.hands[player]!.length;

  switch (move.type) {
    case "pass":
      return `${name} passed`;
    case "draw": {
      const drawn = after.hands[player]!.length - handBefore;
      return drawn === 1 ? `${name} drew a card` : `${name} drew ${drawn} cards`;
    }
    case "play": {
      const card = before.hands[player]!.find((c) => c.id === move.cardId)!;
      const jumpedIn = player !== currentPlayer(before);
      let text = `${name} ${jumpedIn ? "jumped in with" : "played"} ${cardLabel(card)}`;
      if (move.color) text += ` and chose ${move.color}`;
      if (move.target) text += ` and swapped hands with ${seatOf(game, move.target).name}`;
      const handMoves =
        before.options.sevenZero &&
        card.kind === "number" &&
        (card.value === 7 || card.value === 0);
      if (handBefore === 2 && !move.uno && !handMoves) {
        text += `, but forgot to call UNO (+${before.options.unoPenalty})`;
      }
      return text;
    }
  }
}
