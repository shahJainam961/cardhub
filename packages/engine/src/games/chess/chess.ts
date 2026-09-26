import { Chess, DEFAULT_POSITION, type Square } from "chess.js";
import type { GameDefinition, PlayerId, ValidationResult } from "../../core/types";

export type ChessColor = "white" | "black";

export interface ChessOptions {
  /** Starting position as FEN (standard setup by default; custom positions for tests/puzzles). */
  startFen: string;
}

export const DEFAULT_CHESS_OPTIONS: ChessOptions = { startFen: DEFAULT_POSITION };

export type ChessEndReason =
  | "checkmate"
  | "stalemate"
  | "threefoldRepetition"
  | "fiftyMoveRule"
  | "insufficientMaterial"
  | "resignation"
  | "agreement"
  | "timeout"
  /** The flag fell, but the opponent couldn't possibly have checkmated: a draw (FIDE 6.9). */
  | "timeoutVsInsufficientMaterial";

export interface ChessResult {
  winner: PlayerId | null;
  reason: ChessEndReason;
}

export interface ChessState {
  options: ChessOptions;
  /** [white, black]. */
  players: [PlayerId, PlayerId];
  /** Every move so far in UCI form ("e2e4", "e7e8q"). */
  moves: string[];
  /** The same moves in SAN ("e4", "Nf3", "O-O") for the move list. */
  san: string[];
  /** Current position. Its halfmove counter drives the 50-move rule. */
  fen: string;
  /** How often each position has occurred (for threefold repetition), keyed by `positionKey`. */
  positions: Record<string, number>;
  drawOfferBy: PlayerId | null;
  result: ChessResult | null;
}

export type ChessMove =
  /** A board move in UCI form: from, to and optional promotion piece ("e7e8q"). */
  | { type: "move"; uci: string }
  | { type: "resign" }
  | { type: "offerDraw" }
  | { type: "acceptDraw" }
  | { type: "declineDraw" }
  /** The player to move ran out of time. Only the host (server / local game) sends this. */
  | { type: "flag" };

export interface ChessView {
  me: PlayerId | null;
  /** The viewer's color, or null for spectators. */
  color: ChessColor | null;
  players: { white: PlayerId; black: PlayerId };
  fen: string;
  turn: ChessColor;
  inCheck: boolean;
  /** Moves in SAN ("e4", "Nf3", "O-O"), for the move list. */
  san: string[];
  lastMove: { from: string; to: string } | null;
  drawOfferBy: PlayerId | null;
  result: ChessResult | null;
}

const OK: ValidationResult = { ok: true };
const fail = (reason: string): ValidationResult => ({ ok: false, reason });
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** Pieces, side to move, castling rights and en passant square: what makes positions "the same". */
function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** The current position; every rule works from it plus the repetition counts, never a replay. */
function boardOf(s: ChessState): Chess {
  return new Chess(s.fen);
}

function fromUci(uci: string): { from: string; to: string; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci.length > 4 ? { promotion: uci[4]! } : {}),
  };
}

function colorOf(s: ChessState, player: PlayerId): ChessColor | null {
  return s.players[0] === player ? "white" : s.players[1] === player ? "black" : null;
}

function playerToMove(s: ChessState, chess: Chess): PlayerId {
  return chess.turn() === "w" ? s.players[0] : s.players[1];
}

function opponentOf(s: ChessState, player: PlayerId): PlayerId {
  return s.players[0] === player ? s.players[1] : s.players[0];
}

/**
 * Whether `color` could deliver checkmate by any series of legal moves (FIDE 6.9), used when the
 * opponent's flag falls: a bare king never can; a single knight or bishop only if the other side
 * has pieces that could block their own king in; bishops all on one square color need help too.
 */
function canEverMate(chess: Chess, color: "w" | "b"): boolean {
  const squares = chess.board().flat();
  const mine = squares.filter((p) => p && p.color === color && p.type !== "k");
  const theirs = squares.filter((p) => p && p.color !== color && p.type !== "k");
  if (mine.some((p) => p!.type === "p" || p!.type === "q" || p!.type === "r")) return true;
  if (mine.length === 0) return false;
  if (mine.length === 1) return theirs.length > 0;
  const bishopShades = new Set(
    chess
      .board()
      .flatMap((row, r) =>
        row.map((p, c) => (p && p.color === color && p.type === "b" ? (r + c) % 2 : null)),
      )
      .filter((shade) => shade !== null),
  );
  const onlySameShadeBishops = mine.every((p) => p!.type === "b") && bishopShades.size === 1;
  return !onlySameShadeBishops || theirs.length > 0;
}

function naturalEnd(chess: Chess, s: ChessState): ChessResult | null {
  if (chess.isCheckmate())
    return { winner: opponentOf(s, playerToMove(s, chess)), reason: "checkmate" };
  if (chess.isStalemate()) return { winner: null, reason: "stalemate" };
  if (chess.isInsufficientMaterial()) return { winner: null, reason: "insufficientMaterial" };
  if ((s.positions[positionKey(s.fen)] ?? 0) >= 3)
    return { winner: null, reason: "threefoldRepetition" };
  if (chess.isDrawByFiftyMoves()) return { winner: null, reason: "fiftyMoveRule" };
  return null;
}

function validateMove(s: ChessState, player: PlayerId, move: ChessMove): ValidationResult {
  if (s.result) return fail("the game is over");
  if (!colorOf(s, player)) return fail("you are not in this game");
  const chess = boardOf(s);
  const toMove = playerToMove(s, chess);

  switch (move.type) {
    case "resign":
      return OK;
    case "offerDraw":
      return s.drawOfferBy ? fail("a draw offer is already pending") : OK;
    case "acceptDraw":
    case "declineDraw":
      return s.drawOfferBy && s.drawOfferBy !== player
        ? OK
        : fail("there is no draw offer to answer");
    case "flag":
      return player === toMove ? OK : fail("only the player to move can run out of time");
    case "move": {
      if (player !== toMove) return fail("it is not your turn");
      if (typeof move.uci !== "string" || !UCI.test(move.uci)) return fail("malformed move");
      const legal = chess.moves({ verbose: true }).some((m) => m.lan === move.uci);
      if (legal) return OK;
      const needsPromotion = chess
        .moves({ verbose: true, square: move.uci.slice(0, 2) as Square })
        .some((m) => m.to === move.uci.slice(2, 4) && m.promotion);
      return fail(needsPromotion ? "choose a piece to promote to" : "that move is not legal");
    }
  }
}

export const chess: GameDefinition<ChessState, ChessMove, ChessView, ChessOptions> = {
  id: "chess",
  name: "Chess",
  minPlayers: 2,
  maxPlayers: 2,
  defaultOptions: DEFAULT_CHESS_OPTIONS,

  setup({ players, options }) {
    // chess.js validates the FEN and throws on an impossible position.
    const board = new Chess(options.startFen);
    const fen = board.fen();
    const state: ChessState = {
      options: { ...options },
      players: [players[0]!, players[1]!],
      moves: [],
      san: [],
      fen,
      positions: { [positionKey(fen)]: 1 },
      drawOfferBy: null,
      result: null,
    };
    state.result = naturalEnd(board, state);
    return state;
  },

  activePlayers(s) {
    if (s.result) return [];
    const toMove = playerToMove(s, new Chess(s.fen));
    const answering = s.drawOfferBy && s.drawOfferBy === toMove ? [opponentOf(s, toMove)] : [];
    return [toMove, ...answering];
  },

  legalMoves(s, player) {
    if (s.result || !colorOf(s, player)) return [];
    const board = boardOf(s);
    const moves: ChessMove[] = [];
    if (playerToMove(s, board) === player) {
      for (const m of board.moves({ verbose: true })) moves.push({ type: "move", uci: m.lan });
    }
    if (s.drawOfferBy && s.drawOfferBy !== player)
      moves.push({ type: "acceptDraw" }, { type: "declineDraw" });
    if (!s.drawOfferBy) moves.push({ type: "offerDraw" });
    moves.push({ type: "resign" });
    return moves;
  },

  validateMove,

  applyMove(state, player, move) {
    const s: ChessState = {
      ...state,
      options: { ...state.options },
      moves: [...state.moves],
      san: [...state.san],
      positions: { ...state.positions },
    };
    const board = boardOf(s);
    switch (move.type) {
      case "resign":
        s.result = { winner: opponentOf(s, player), reason: "resignation" };
        break;
      case "offerDraw":
        s.drawOfferBy = player;
        break;
      case "acceptDraw":
        s.drawOfferBy = null;
        s.result = { winner: null, reason: "agreement" };
        break;
      case "declineDraw":
        s.drawOfferBy = null;
        break;
      case "flag": {
        const opponent = opponentOf(s, player);
        const opponentColor = colorOf(s, opponent) === "white" ? "w" : "b";
        s.result = canEverMate(board, opponentColor)
          ? { winner: opponent, reason: "timeout" }
          : { winner: null, reason: "timeoutVsInsufficientMaterial" };
        break;
      }
      case "move": {
        const played = board.move(fromUci(move.uci));
        s.moves.push(move.uci);
        s.san.push(played.san);
        s.fen = board.fen();
        const key = positionKey(s.fen);
        s.positions[key] = (s.positions[key] ?? 0) + 1;
        // Making a move declines a draw offer from the opponent (FIDE 9.1.2.3).
        if (s.drawOfferBy && s.drawOfferBy !== player) s.drawOfferBy = null;
        s.result = naturalEnd(board, s);
        break;
      }
    }
    return s;
  },

  playerView(s, player) {
    const board = boardOf(s);
    const last = s.moves.at(-1);
    return {
      me: player,
      color: player ? colorOf(s, player) : null,
      players: { white: s.players[0], black: s.players[1] },
      fen: s.fen,
      turn: board.turn() === "w" ? "white" : "black",
      inCheck: board.inCheck(),
      san: [...s.san],
      lastMove: last ? { from: last.slice(0, 2), to: last.slice(2, 4) } : null,
      drawOfferBy: s.drawOfferBy,
      result: s.result ? { ...s.result } : null,
    };
  },

  result(s) {
    if (!s.result) return null;
    return s.result.winner
      ? { outcome: "win", winners: [s.result.winner] }
      : { outcome: "draw", winners: [] };
  },
};
