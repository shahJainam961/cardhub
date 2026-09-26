import { describe, expect, it } from "vitest";
import {
  flaggedPlayer,
  msUntilFlag,
  pauseClock,
  pressClock,
  remainingMs,
  resumeClock,
  startClock,
} from "../../core/clock";
import { InvalidMoveError, playMove, startGame } from "../../core/play";
import { chess, type ChessMove, type ChessState } from "./chess";
import { customTimeControl, TIME_CONTROL_PRESETS, timeControlLabel } from "./timeControls";

const W = "white-player";
const B = "black-player";

function game(startFen?: string): ChessState {
  return startGame(chess, {
    players: [W, B],
    seed: 1,
    ...(startFen ? { options: { startFen } } : {}),
  });
}

/** Plays alternating UCI moves starting with the side to move. */
function playLine(s: ChessState, ...ucis: string[]): ChessState {
  for (const uci of ucis) {
    const [player] = chess.activePlayers(s);
    s = playMove(chess, s, player!, { type: "move", uci });
  }
  return s;
}

const act = (s: ChessState, player: string, move: ChessMove) => playMove(chess, s, player, move);

describe("chess moves", () => {
  it("starts with white to move and 20 legal moves", () => {
    const s = game();
    expect(chess.activePlayers(s)).toEqual([W]);
    expect(chess.legalMoves(s, W).filter((m) => m.type === "move")).toHaveLength(20);
    expect(chess.legalMoves(s, B).filter((m) => m.type === "move")).toHaveLength(0);
  });

  it("rejects illegal, malformed and out-of-turn moves", () => {
    const s = game();
    expect(() => act(s, W, { type: "move", uci: "e2e5" })).toThrow(/not legal/);
    expect(() => act(s, W, { type: "move", uci: "hello" })).toThrow(/malformed/);
    expect(() => act(s, B, { type: "move", uci: "e7e5" })).toThrow(/not your turn/);
  });

  it("castles, captures en passant and promotes to the chosen piece", () => {
    const castled = playLine(game(), "e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "e1g1");
    expect(chess.playerView(castled, W).san.at(-1)).toBe("O-O");

    const ep = playLine(game(), "e2e4", "a7a6", "e4e5", "d7d5", "e5d6");
    expect(chess.playerView(ep, W).san.at(-1)).toBe("exd6");

    const promo = game("8/P7/8/8/8/8/8/k6K w - - 0 1");
    expect(() => act(promo, W, { type: "move", uci: "a7a8" })).toThrow(/choose a piece/);
    const knighted = act(promo, W, { type: "move", uci: "a7a8n" });
    expect(knighted.fen.startsWith("N7/")).toBe(true);
  });

  it("shows check and the last move", () => {
    const s = playLine(game(), "e2e4", "f7f6", "d1h5");
    const view = chess.playerView(s, B);
    expect(view).toMatchObject({
      inCheck: true,
      turn: "black",
      color: "black",
      lastMove: { from: "d1", to: "h5" },
    });
  });
});

describe("game endings", () => {
  it("checkmate wins (fool's mate)", () => {
    const s = playLine(game(), "f2f3", "e7e5", "g2g4", "d8h4");
    expect(s.result).toEqual({ winner: B, reason: "checkmate" });
    expect(chess.result(s)).toEqual({ outcome: "win", winners: [B] });
    expect(chess.activePlayers(s)).toEqual([]);
    expect(() => act(s, W, { type: "resign" })).toThrow(/game is over/);
  });

  it("stalemate is a draw", () => {
    // Qe7-f7 leaves the black king on h8 with no legal move and not in check.
    const s = act(game("7k/4Q3/6K1/8/8/8/8/8 w - - 0 1"), W, { type: "move", uci: "e7f7" });
    expect(s.result?.reason).toBe("stalemate");
    expect(chess.result(s)).toEqual({ outcome: "draw", winners: [] });
  });

  it("draws automatically by threefold repetition", () => {
    const s = playLine(game(), "g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8");
    expect(s.result?.reason).toBe("threefoldRepetition");
  });

  it("draws automatically by the 50-move rule", () => {
    const s = act(game("8/8/8/4k3/8/8/4K3/7R w - - 99 80"), W, { type: "move", uci: "h1h2" });
    expect(s.result?.reason).toBe("fiftyMoveRule");
  });

  it("draws automatically with insufficient material", () => {
    // Taking the last pawn leaves king against king.
    const s = act(game("8/8/8/4k3/8/8/3pK3/8 w - - 0 1"), W, { type: "move", uci: "e2d2" });
    expect(s.result?.reason).toBe("insufficientMaterial");
  });

  it("resigning gives the win to the opponent, even out of turn", () => {
    expect(act(game(), B, { type: "resign" }).result).toEqual({ winner: W, reason: "resignation" });
  });
});

describe("draw offers", () => {
  it("can be accepted or declined, and making a move declines it", () => {
    let s = act(game(), W, { type: "offerDraw" });
    expect(chess.activePlayers(s)).toEqual([W, B]);
    expect(() => act(s, W, { type: "acceptDraw" })).toThrow(/no draw offer/);
    expect(act(s, B, { type: "acceptDraw" }).result?.reason).toBe("agreement");
    expect(act(s, B, { type: "declineDraw" }).drawOfferBy).toBeNull();

    s = playLine(s, "e2e4");
    expect(s.drawOfferBy).toBe(W); // white's own move doesn't cancel white's offer
    s = playLine(s, "e7e5");
    expect(s.drawOfferBy).toBeNull(); // black moved instead of accepting
  });
});

describe("flag fall", () => {
  const flag = (fen: string) => {
    const s = game(fen);
    return act(s, chess.activePlayers(s)[0]!, { type: "flag" });
  };

  it("loses on time when the opponent could still mate", () => {
    expect(flag("4k3/8/8/8/8/8/4P3/4K2r w - - 0 1").result).toEqual({
      winner: B,
      reason: "timeout",
    });
  });

  it("draws when the opponent has only a king", () => {
    expect(flag("4k3/8/8/8/8/8/3QQ3/4K3 w - - 0 1").result?.reason).toBe(
      "timeoutVsInsufficientMaterial",
    );
  });

  it("a lone knight still wins on time when the flagged side has pieces to block with", () => {
    // (Knight against a bare king is already a draw, so that flag can't happen.)
    expect(flag("4k3/8/8/8/8/8/4P3/n3K3 w - - 0 1").result?.reason).toBe("timeout");
  });

  it("can only be called on the player to move", () => {
    expect(() => act(game(), B, { type: "flag" })).toThrow(/player to move/);
  });
});

describe("clock", () => {
  const tc = { initialMs: 60_000, incrementMs: 2_000 };

  it("counts down the running side and adds the increment after a move", () => {
    let clock = startClock(tc, 0, 0);
    expect(remainingMs(clock, 10_000)).toEqual([50_000, 60_000]);
    clock = pressClock(clock, tc, 10_000);
    expect(clock.running).toBe(1);
    expect(remainingMs(clock, 15_000)).toEqual([52_000, 55_000]);
    expect(msUntilFlag(clock, 15_000)).toBe(55_000);
  });

  it("flags the running player at zero", () => {
    const clock = startClock(tc, 0, 0);
    expect(flaggedPlayer(clock, 59_999)).toBeNull();
    expect(flaggedPlayer(clock, 60_000)).toBe(0);
  });

  it("pauses during a handoff without charging anyone", () => {
    let clock = pauseClock(startClock(tc, 0, 0), 5_000);
    expect(remainingMs(clock, 100_000)).toEqual([55_000, 60_000]);
    expect(flaggedPlayer(clock, 1e9)).toBeNull();
    clock = resumeClock(clock, 0, 100_000);
    expect(remainingMs(clock, 101_000)).toEqual([54_000, 60_000]);
  });
});

describe("time controls", () => {
  it("offers presets in every category", () => {
    expect(new Set(TIME_CONTROL_PRESETS.map((p) => p.category))).toEqual(
      new Set(["bullet", "blitz", "rapid", "classical"]),
    );
    expect(TIME_CONTROL_PRESETS.map((p) => p.label)).toContain("5+3");
  });

  it("validates custom time controls", () => {
    expect(customTimeControl(7, 4)).toEqual({ initialMs: 420_000, incrementMs: 4_000 });
    expect(customTimeControl(0.5, 0)).not.toBeNull();
    expect(customTimeControl(0, 5)).toBeNull();
    expect(customTimeControl(200, 0)).toBeNull();
    expect(customTimeControl(10, 61)).toBeNull();
    expect(timeControlLabel(customTimeControl(0.5, 0))).toBe("½+0");
    expect(timeControlLabel(null)).toBe("Untimed");
  });
});

describe("custom start positions", () => {
  it("rejects impossible positions", () => {
    expect(() => game("not a fen")).toThrow();
  });

  it("detects a position that is already over", () => {
    expect(game("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").result?.reason).toBe("stalemate");
  });

  it("treats a malformed move as invalid rather than crashing", () => {
    expect(() => act(game(), W, { type: "move", uci: 42 as unknown as string })).toThrow(
      InvalidMoveError,
    );
  });
});
