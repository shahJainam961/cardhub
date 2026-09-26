import {
  createRng,
  monopolyDeal,
  playMove,
  startGame,
  type DealCard,
  type MonopolyDealState,
  type MonopolyDealView,
} from "@cardhub/engine";
import { describe, expect, it } from "vitest";
import { chooseMonopolyDealMove, pickMonopolyDealBotAction } from "./monopolyDeal";
import type { BotLevel } from "./types";

function botGame(
  levels: BotLevel[],
  seed: number,
  onState?: (s: MonopolyDealState, move: number) => void,
) {
  const players = levels.map((_, i) => `p${i}`);
  const bots = Object.fromEntries(players.map((p, i) => [p, levels[i]!]));
  let state = startGame(monopolyDeal, { players, seed });
  for (let move = 0; move < 5_000 && !monopolyDeal.result(state); move++) {
    onState?.(state, move);
    const action = pickMonopolyDealBotAction(state, bots, seed * 7919 + move)!;
    // playMove throws on any illegal move, so every bot move is checked.
    state = playMove(monopolyDeal, state, action.player, action.move);
  }
  return monopolyDeal.result(state);
}

/**
 * Deals everything the bot can't see (other hands, the draw pile, the discard pile under its top
 * card) at random again, keeping every count the same. A bot that only uses its own view must make
 * exactly the same move in both states.
 */
function reshuffleHidden(s: MonopolyDealState, viewer: string, seed: number): MonopolyDealState {
  const next = structuredClone(s);
  const others = next.players.filter((p) => p !== viewer);
  const top = next.discardPile.pop();
  const hidden: DealCard[] = [
    ...next.drawPile,
    ...next.discardPile,
    ...others.flatMap((p) => next.hands[p]!),
  ];
  createRng(seed).shuffle(hidden);
  for (const p of others) next.hands[p] = hidden.splice(0, s.hands[p]!.length);
  next.drawPile = hidden.splice(0, s.drawPile.length);
  next.discardPile = [...hidden, ...(top ? [top] : [])];
  return next;
}

describe("monopoly deal bots", () => {
  it("finish every game using only legal moves, with 2 to 5 players", () => {
    for (let seed = 0; seed < 40; seed++) {
      const n = 2 + (seed % 4);
      const levels = Array.from({ length: n }, (_, i): BotLevel =>
        (seed + i) % 2 ? "easy" : "normal",
      );
      expect(botGame(levels, seed), `seed ${seed}`).not.toBeNull();
    }
  });

  it("normal clearly beats easy", () => {
    let normalWins = 0;
    for (let seed = 0; seed < 100; seed++) {
      const swap = seed % 2 === 1;
      const result = botGame(swap ? ["easy", "normal"] : ["normal", "easy"], seed);
      if (result?.winners[0] === (swap ? "p1" : "p0")) normalWins++;
    }
    expect(normalWins).toBeGreaterThan(85);
  });

  it("never uses hidden information: other hands and the draw pile don't change its choices", () => {
    let checked = 0;
    for (const level of ["easy", "normal"] as const) {
      for (let seed = 0; seed < 6; seed++) {
        botGame(["normal", "normal", "normal"], seed + 100, (state, move) => {
          const [player] = monopolyDeal.activePlayers(state);
          if (!player) return;
          const bots = { [player]: level };
          const real = pickMonopolyDealBotAction(state, bots, move);
          const shuffled = pickMonopolyDealBotAction(
            reshuffleHidden(state, player, move),
            bots,
            move,
          );
          expect(shuffled).toEqual(real);
          checked++;
        });
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe("normal bot judgement", () => {
  const card = (c: Partial<DealCard> & { kind: DealCard["kind"] }): DealCard =>
    ({ id: `x${Math.random()}`, value: 1, ...c }) as DealCard;

  function viewWith(overrides: Partial<MonopolyDealView>): MonopolyDealView {
    const base = monopolyDeal.playerView(
      startGame(monopolyDeal, { players: ["me", "them"], seed: 1 }),
      "me",
    );
    return {
      ...base,
      hand: [],
      players: [
        { id: "me", handCount: 0, table: { bank: [], properties: [], buildings: [] } },
        { id: "them", handCount: 5, table: { bank: [], properties: [], buildings: [] } },
      ],
      ...overrides,
    };
  }

  it("uses Just Say No against a Deal Breaker but not against a 1M birthday", () => {
    const jsn = card({ kind: "action", action: "justSayNo", value: 4 });
    const pending = (kind: "dealBreaker" | "birthday", amount: number) =>
      viewWith({
        hand: [jsn],
        pending: {
          kind,
          actor: "them",
          targets: ["me"],
          amount,
          justSayNos: 0,
          paying: false,
          color: "red",
        },
        players: [
          {
            id: "me",
            handCount: 1,
            table: { bank: [card({ kind: "money", value: 1 })], properties: [], buildings: [] },
          },
          { id: "them", handCount: 5, table: { bank: [], properties: [], buildings: [] } },
        ],
      });
    const legal = [{ type: "accept" as const }, { type: "justSayNo" as const, cardId: jsn.id }];
    const rng = createRng(1);
    expect(chooseMonopolyDealMove(pending("dealBreaker", 0), legal, "normal", rng).type).toBe(
      "justSayNo",
    );
    expect(chooseMonopolyDealMove(pending("birthday", 2), legal, "normal", rng).type).toBe(
      "accept",
    );
  });

  it("keeps Deal Breakers instead of banking them", () => {
    const breaker = card({ kind: "action", action: "dealBreaker", value: 5 });
    const legal = [{ type: "endTurn" as const }, { type: "bank" as const, cardId: breaker.id }];
    expect(
      chooseMonopolyDealMove(viewWith({ hand: [breaker] }), legal, "normal", createRng(1)),
    ).toEqual({
      type: "endTurn",
    });
  });
});
