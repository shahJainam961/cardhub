import { pickUnoBotAction, type BotLevel } from "@cardhub/bots";
import {
  playMove,
  startGame,
  type PlayerId,
  type UnoMove,
  type UnoOptions,
  type UnoState,
  uno,
} from "@cardhub/engine";
import { describeUnoMove } from "@cardhub/shared";

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
  const bots = Object.fromEntries(
    game.seats.filter((s) => s.kind === "bot").map((s) => [s.id, s.level]),
  );
  return pickUnoBotAction(game.state, bots, game.seed + Math.imul(game.moveCount + 1, 0x9e3779b1));
}

export function describeMove(
  game: LocalUnoGame,
  player: PlayerId,
  move: UnoMove,
  after: UnoState,
): string {
  return describeUnoMove(game.state, after, player, move, (id) => seatOf(game, id).name);
}
