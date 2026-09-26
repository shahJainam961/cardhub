import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { playMove, startGame } from "../../core/play";
import { createRng } from "../../core/rng";
import { chess, type ChessMove } from "./chess";

const MAX_PLIES = 1_000;

/** Random legal board moves only (no resigning or draw offers) until the game ends by itself. */
function randomGame(seed: number) {
  let state = startGame(chess, { players: ["w", "b"], seed });
  const rng = createRng(seed);
  const history: { player: string; move: ChessMove }[] = [];
  for (let ply = 0; ply < MAX_PLIES && !state.result; ply++) {
    const [player] = chess.activePlayers(state);
    const moves = chess.legalMoves(state, player!).filter((m) => m.type === "move");
    expect(
      moves.length,
      "a side to move with no board moves must already be mate or stalemate",
    ).toBeGreaterThan(0);
    const move = moves[rng.int(moves.length)]!;
    state = playMove(chess, state, player!, move);
    history.push({ player: player!, move });
    expect(state.moves).toHaveLength(ply + 1);
  }
  return { state, history, seed };
}

describe("chess simulation", () => {
  it("random games always end by one of the rules", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const { state } = randomGame(seed);
        expect(
          state.result,
          "game should end within the 50-move and repetition rules",
        ).not.toBeNull();
        expect([
          "checkmate",
          "stalemate",
          "threefoldRepetition",
          "fiftyMoveRule",
          "insufficientMaterial",
        ]).toContain(state.result!.reason);
      }),
      { numRuns: 10 },
    );
  }, 60_000);

  it("replays identically from the move history", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const { state, history } = randomGame(seed);
        let replay = startGame(chess, { players: ["w", "b"], seed });
        for (const { player, move } of history) replay = playMove(chess, replay, player, move);
        expect(replay).toEqual(state);
      }),
      { numRuns: 3 },
    );
  }, 60_000);
});
