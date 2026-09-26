import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { playMove, startGame } from "../../core/play";
import { createRng } from "../../core/rng";
import { COLOR_INFO, DEAL_COLORS, DEAL_DECK_SIZE } from "./cards";
import { monopolyDeal, type MonopolyDealMove, type MonopolyDealState } from "./monopolyDeal";
import { buildingsOn, setInfo } from "./table";

const MAX_MOVES = 20_000;
const SIMULATION_TIMEOUT_MS = 60_000;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invariant broken: ${message}`);
}

function checkInvariants(s: MonopolyDealState): void {
  const all = [
    ...s.drawPile,
    ...s.discardPile,
    ...s.players.flatMap((p) => {
      const t = s.tables[p]!;
      return [
        ...s.hands[p]!,
        ...t.bank,
        ...t.properties.map((x) => x.card),
        ...t.buildings.map((b) => b.card),
      ];
    }),
  ];
  assert(all.length === DEAL_DECK_SIZE, `expected ${DEAL_DECK_SIZE} cards, found ${all.length}`);
  assert(new Set(all.map((c) => c.id)).size === DEAL_DECK_SIZE, "duplicate card ids");
  assert(s.playsLeft >= 0 && s.playsLeft <= s.options.playsPerTurn, `plays left ${s.playsLeft}`);

  for (const player of s.players) {
    const table = s.tables[player]!;
    assert(
      !table.bank.some((c) => c.kind === "property" || c.kind === "wild"),
      "property in a bank",
    );
    for (const color of DEAL_COLORS) {
      const houses = buildingsOn(table, color, "house");
      const hotels = buildingsOn(table, color, "hotel");
      const { complete } = setInfo(table, color);
      assert(
        houses <= (COLOR_INFO[color].buildable ? complete : 0),
        `house without a complete ${color} set`,
      );
      assert(hotels <= houses, `hotel without a house on ${color}`);
    }
    // Nobody can see another player's hand or the draw pile.
    const visible = new Set(
      [...JSON.stringify(monopolyDeal.playerView(s, player)).matchAll(/"(d\d+)"/g)].map(
        (m) => m[1],
      ),
    );
    const hidden = [
      ...s.drawPile,
      ...s.players.filter((p) => p !== player).flatMap((p) => s.hands[p]!),
    ];
    for (const card of hidden) assert(!visible.has(card.id), `${player} can see ${card.id}`);
  }
  if (s.phase === "discard") assert(s.pending === null, "discarding while an action is pending");
}

/** A random player that prefers playing cards to ending the turn early. */
function playRandomGame(playerCount: number, seed: number) {
  const players = Array.from({ length: playerCount }, (_, i) => `p${i}`);
  let state = startGame(monopolyDeal, { players, seed });
  const rng = createRng(seed ^ 0x51ed27);
  const history: { player: string; move: MonopolyDealMove }[] = [];

  for (let i = 0; i < MAX_MOVES && !monopolyDeal.result(state); i++) {
    checkInvariants(state);
    const [actor] = monopolyDeal.activePlayers(state);
    assert(actor !== undefined, "nobody can move but the game isn't over");
    const moves = monopolyDeal.legalMoves(state, actor);
    assert(moves.length > 0, `${actor} must act but has no legal moves`);
    const plays = moves.filter((m) => m.type !== "endTurn" && m.type !== "moveWild");
    const pool = plays.length > 0 && rng.next() < 0.85 ? plays : moves;
    const move = pool[rng.int(pool.length)]!;
    state = playMove(monopolyDeal, state, actor, move);
    history.push({ player: actor, move });
  }
  checkInvariants(state);
  return { players, state, history };
}

describe("monopoly deal simulation", () => {
  it(
    "random games keep every invariant and always end",
    () => {
      fc.assert(
        fc.property(fc.integer({ min: 2, max: 5 }), fc.integer(), (n, seed) => {
          const { state } = playRandomGame(n, seed);
          const result = monopolyDeal.result(state);
          expect(result, "game did not finish").not.toBeNull();
          if (result?.outcome === "win") {
            const sets = DEAL_COLORS.filter(
              (c) => setInfo(state.tables[result.winners[0]!]!, c).complete > 0,
            );
            expect(sets.length).toBeGreaterThanOrEqual(3);
          }
        }),
        { numRuns: 60 },
      );
    },
    SIMULATION_TIMEOUT_MS,
  );

  it(
    "replays identically from the seed and move history",
    () => {
      fc.assert(
        fc.property(fc.integer({ min: 2, max: 5 }), fc.integer(), (n, seed) => {
          const { players, state, history } = playRandomGame(n, seed);
          let replay = startGame(monopolyDeal, { players, seed });
          for (const { player, move } of history)
            replay = playMove(monopolyDeal, replay, player, move);
          expect(replay).toEqual(state);
        }),
        { numRuns: 15 },
      );
    },
    SIMULATION_TIMEOUT_MS,
  );
});
