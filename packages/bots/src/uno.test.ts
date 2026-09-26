import {
  createRng,
  playMove,
  startGame,
  uno,
  type UnoCard,
  type UnoMove,
  type UnoView,
} from "@cardhub/engine";
import { describe, expect, it } from "vitest";
import type { BotLevel } from "./types";
import { chooseUnoMove } from "./uno";

/** Plays a whole game where each seat is driven by a bot of the given level. */
function botGame(levels: BotLevel[], seed: number) {
  const players = levels.map((_, i) => `p${i}`);
  let state = startGame(uno, { players, seed });
  const rng = createRng(seed + 1);
  for (let i = 0; i < 5000 && !uno.result(state); i++) {
    const player = uno.activePlayers(state)[0]!;
    const legal = uno.legalMoves(state, player);
    const move = chooseUnoMove(
      uno.playerView(state, player),
      legal,
      levels[players.indexOf(player)]!,
      rng,
    );
    state = playMove(uno, state, player, move);
  }
  return uno.result(state);
}

const card = (color: "red" | "blue", value: number): UnoCard => ({
  id: `${color}${value}`,
  kind: "number",
  color,
  value,
});

function viewWith(hand: UnoCard[], opponentCards = 7): UnoView {
  return {
    me: "me",
    hand,
    players: [
      { id: "me", cardCount: hand.length },
      { id: "them", cardCount: opponentCards },
    ],
    topCard: card("red", 5),
    currentColor: "red",
    currentPlayer: "me",
    direction: 1,
    pendingDraw: 0,
    drawPileCount: 50,
    hasDrawn: false,
    drawnCardId: null,
    winner: null,
    options: uno.defaultOptions,
  };
}

describe("uno bots", () => {
  it("finish every game with only legal moves", () => {
    for (let seed = 0; seed < 100; seed++) {
      const levels: BotLevel[] = seed % 2 ? ["easy", "normal", "easy"] : ["normal", "normal"];
      expect(botGame(levels, seed)?.outcome).toBe("win");
    }
  });

  it("normal beats easy in most head-to-head games", () => {
    let normalWins = 0;
    for (let seed = 0; seed < 300; seed++) {
      if (botGame(["normal", "easy"], seed)?.winners[0] === "p0") normalWins++;
    }
    expect(normalWins).toBeGreaterThan(165);
  });

  it("saves wild cards when a colored card can be played", () => {
    const wild: UnoCard = { id: "w", kind: "wild" };
    const red = card("red", 2);
    const legal: UnoMove[] = [
      { type: "draw" },
      { type: "play", cardId: red.id },
      ...(["red", "yellow", "green", "blue"] as const).map((color): UnoMove => ({
        type: "play",
        cardId: wild.id,
        color,
      })),
    ];
    const move = chooseUnoMove(
      viewWith([wild, red, card("blue", 3)]),
      legal,
      "normal",
      createRng(1),
    );
    expect(move).toEqual({ type: "play", cardId: red.id });
  });

  it("picks the color it holds most of for a wild", () => {
    const wild: UnoCard = { id: "w", kind: "wild" };
    const legal = (["red", "yellow", "green", "blue"] as const).map((color): UnoMove => ({
      type: "play",
      cardId: wild.id,
      color,
    }));
    const hand = [wild, card("blue", 1), card("blue", 2), card("red", 3)];
    expect(chooseUnoMove(viewWith(hand), legal, "normal", createRng(1))).toMatchObject({
      color: "blue",
    });
  });

  it("draws when nothing can be played", () => {
    expect(
      chooseUnoMove(viewWith([card("blue", 1)]), [{ type: "draw" }], "normal", createRng(1)),
    ).toEqual({
      type: "draw",
    });
  });
});

describe("uno bots and hidden information", () => {
  it("make the same choice however the cards they can't see are arranged", () => {
    let checked = 0;
    for (let seed = 0; seed < 20; seed++) {
      const players = ["p0", "p1", "p2"];
      let state = startGame(uno, { players, options: { jumpIn: true, stacking: true }, seed });
      for (let move = 0; move < 2_000 && !uno.result(state); move++) {
        const player = uno.activePlayers(state)[0]!;
        for (const level of ["easy", "normal"] as const) {
          // Deal the other hands and the draw pile (and discards under the top card) again.
          const shuffled = structuredClone(state);
          const others = players.filter((p) => p !== player);
          const top = shuffled.discardPile.pop()!;
          const hidden = [
            ...shuffled.drawPile,
            ...shuffled.discardPile,
            ...others.flatMap((p) => shuffled.hands[p]!),
          ];
          createRng(move + 1).shuffle(hidden);
          for (const p of others) shuffled.hands[p] = hidden.splice(0, state.hands[p]!.length);
          shuffled.drawPile = hidden.splice(0, state.drawPile.length);
          shuffled.discardPile = [...hidden, top];

          const decide = (s: typeof state) =>
            chooseUnoMove(
              uno.playerView(s, player),
              uno.legalMoves(s, player),
              level,
              createRng(move),
            );
          expect(decide(shuffled)).toEqual(decide(state));
          checked++;
        }
        const move_ = chooseUnoMove(
          uno.playerView(state, player),
          uno.legalMoves(state, player),
          "normal",
          createRng(move),
        );
        state = playMove(uno, state, player, move_);
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
