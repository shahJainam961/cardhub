import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { playMove, startGame } from "../../core/play";
import { createRng } from "../../core/rng";
import { uno, type UnoMove, type UnoOptions, type UnoState } from "./uno";

const MAX_MOVES = 20_000;
// Hundreds of full games per test; generous so slower CI machines do not time out.
const SIMULATION_TIMEOUT_MS = 30_000;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invariant broken: ${message}`);
}

function checkInvariants(s: UnoState): void {
  const all = [...s.drawPile, ...s.discardPile, ...s.players.flatMap((p) => s.hands[p]!)];
  assert(all.length === 108, `expected 108 cards, found ${all.length}`);
  assert(new Set(all.map((c) => c.id)).size === 108, "duplicate card ids");
  assert(s.discardPile.length > 0, "discard pile is empty");
  assert(s.currentIndex >= 0 && s.currentIndex < s.players.length, "current player out of range");
  assert(s.options.stacking || s.pendingDraw === 0, "pending draw without stacking");

  const topId = s.discardPile[s.discardPile.length - 1]!.id;
  for (const viewer of s.players) {
    const visible = new Set([topId, ...s.hands[viewer]!.map((c) => c.id)]);
    const view = JSON.stringify(uno.playerView(s, viewer));
    for (const [, id] of view.matchAll(/"(c\d+)"/g)) {
      assert(visible.has(id!), `${viewer} can see hidden card ${id}`);
    }
  }
}

/** A random bot that mostly plays cards; occasionally lets a jump-in player act. */
function playRandomGame(playerCount: number, seed: number, options: Partial<UnoOptions>) {
  const players = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  let state = startGame(uno, { players, options, seed });
  const rng = createRng(seed ^ 0x9e3779b9);
  const history: { player: string; move: UnoMove }[] = [];

  for (let i = 0; i < MAX_MOVES && !uno.result(state); i++) {
    checkInvariants(state);
    const actors = uno.activePlayers(state);
    const actor =
      actors.length > 1 && rng.next() < 0.3 ? actors[rng.int(actors.length)]! : actors[0]!;
    const moves = uno.legalMoves(state, actor);
    expect(moves.length, `${actor} is active but has no legal moves`).toBeGreaterThan(0);
    const plays = moves.filter((m) => m.type === "play");
    const pool = plays.length > 0 && rng.next() < 0.9 ? plays : moves;
    const move = pool[rng.int(pool.length)]!;
    state = playMove(uno, state, actor, move);
    history.push({ player: actor, move });
  }
  checkInvariants(state);
  return { players, state, history };
}

const optionsArb = fc.record({
  stacking: fc.boolean(),
  sevenZero: fc.boolean(),
  jumpIn: fc.boolean(),
  drawUntilPlayable: fc.boolean(),
});

describe("uno simulation", () => {
  it(
    "random games always finish with a winner and keep every invariant",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }),
          fc.integer(),
          optionsArb,
          (n, seed, options) => {
            const { state } = playRandomGame(n, seed, options);
            const result = uno.result(state);
            expect(result?.outcome).toBe("win");
            expect(state.hands[result!.winners[0]!]).toHaveLength(0);
          },
        ),
        { numRuns: 200 },
      );
    },
    SIMULATION_TIMEOUT_MS,
  );

  it(
    "replays identically from the seed and move history",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 6 }),
          fc.integer(),
          optionsArb,
          (n, seed, options) => {
            const { players, state, history } = playRandomGame(n, seed, options);
            let replay = startGame(uno, { players, options, seed });
            for (const { player, move } of history) replay = playMove(uno, replay, player, move);
            expect(replay).toEqual(state);
          },
        ),
        { numRuns: 50 },
      );
    },
    SIMULATION_TIMEOUT_MS,
  );
});
