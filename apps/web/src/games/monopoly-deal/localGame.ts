import {
  botThinkingTimeMs,
  pickMonopolyDealBotAction,
  type BotLevel,
  type ThinkWeight,
} from "@cardhub/bots";
import {
  createRng,
  monopolyDeal,
  playMove,
  startGame,
  type MonopolyDealMove,
  type MonopolyDealState,
  type PlayerId,
} from "@cardhub/engine";
import { describeMonopolyDealMove } from "@cardhub/shared";

export interface Seat {
  id: PlayerId;
  name: string;
  kind: "human" | "bot";
  /** Only used when `kind` is "bot". */
  level: BotLevel;
}

/** A Monopoly Deal game on this device: pass-and-play humans and/or bots. */
export interface LocalDealGame {
  seats: Seat[];
  seed: number;
  /** Multiplies every bot pause (1 = human-like, 0 = instant for tests). */
  botSpeed: number;
  state: MonopolyDealState;
  moveCount: number;
  log: string[];
  /** The human whose cards are on screen. With several humans it changes at each handoff. */
  revealedFor: PlayerId | null;
}

const MAX_LOG = 60;

export function createLocalDealGame(
  seats: Seat[],
  { seed, botSpeed }: { seed: number; botSpeed: number },
): LocalDealGame {
  const state = startGame(monopolyDeal, { players: seats.map((s) => s.id), seed });
  const humans = seats.filter((s) => s.kind === "human");
  return {
    seats,
    seed,
    botSpeed,
    state,
    moveCount: 0,
    log: [],
    revealedFor: humans.length === 1 ? humans[0]!.id : null,
  };
}

export function seatOf(game: LocalDealGame, player: PlayerId): Seat {
  const seat = game.seats.find((s) => s.id === player);
  if (!seat) throw new Error(`Unknown seat ${player}`);
  return seat;
}

/** Who must act now: the current player, or someone answering an action (paying, Just Say No). */
export function awaitingPlayer(game: LocalDealGame): PlayerId | null {
  return monopolyDeal.activePlayers(game.state)[0] ?? null;
}

/**
 * The human who must take the device before their cards are shown. With several humans this also
 * happens mid-turn, e.g. when another human has to pay rent or may play Just Say No.
 */
export function pendingHandoff(game: LocalDealGame): PlayerId | null {
  if (monopolyDeal.result(game.state)) return null;
  if (game.seats.filter((s) => s.kind === "human").length < 2) return null;
  const awaiting = awaitingPlayer(game);
  if (!awaiting || seatOf(game, awaiting).kind !== "human") return null;
  return game.revealedFor === awaiting ? null : awaiting;
}

export function revealHand(game: LocalDealGame, player: PlayerId): LocalDealGame {
  return { ...game, revealedFor: player };
}

/** Validates and applies a move (throws `InvalidMoveError` when illegal). */
export function applyLocalMove(
  game: LocalDealGame,
  player: PlayerId,
  move: MonopolyDealMove,
): LocalDealGame {
  const state = playMove(monopolyDeal, game.state, player, move);
  const lines = describeMonopolyDealMove(
    game.state,
    state,
    player,
    move,
    (id) => seatOf(game, id).name,
  );
  return {
    ...game,
    state,
    moveCount: game.moveCount + 1,
    log: [...game.log, ...lines].slice(-MAX_LOG),
  };
}

function weightOf(state: MonopolyDealState, move: MonopolyDealMove): ThinkWeight {
  if (move.type === "endTurn" || move.type === "accept") return state.pending ? "normal" : "quick";
  if (move.type === "pay" || move.type === "justSayNo" || move.type === "discard") return "hard";
  if (move.type === "bank" || move.type === "property") return "normal";
  return "hard";
}

/** The next bot move and a human-like pause before making it, or `null` when a human must act. */
export function nextBotAction(
  game: LocalDealGame,
): { player: PlayerId; move: MonopolyDealMove; delayMs: number } | null {
  const bots = Object.fromEntries(
    game.seats.filter((s) => s.kind === "bot").map((s) => [s.id, s.level]),
  );
  const seed = game.seed + Math.imul(game.moveCount + 1, 0x9e3779b1);
  const action = pickMonopolyDealBotAction(game.state, bots, seed);
  if (!action) return null;
  const delayMs = botThinkingTimeMs(
    weightOf(game.state, action.move),
    createRng(seed ^ 0x5bd1e995),
    game.botSpeed,
  );
  return { ...action, delayMs };
}
