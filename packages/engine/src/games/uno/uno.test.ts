import { describe, expect, it } from "vitest";
import { InvalidMoveError, playMove, startGame } from "../../core/play";
import { createUnoDeck, type UnoCard, type UnoColor } from "./cards";
import { DEFAULT_UNO_OPTIONS, uno, type UnoMove, type UnoOptions, type UnoState } from "./uno";

let nextId = 0;
const num = (color: UnoColor, value: number): UnoCard => ({
  id: `t${nextId++}`,
  kind: "number",
  color,
  value,
});
const action = (color: UnoColor, kind: "skip" | "reverse" | "drawTwo"): UnoCard => ({
  id: `t${nextId++}`,
  kind,
  color,
});
const wild = (kind: "wild" | "wildDrawFour" = "wild"): UnoCard => ({ id: `t${nextId++}`, kind });
const filler = (count: number) => Array.from({ length: count }, () => num("green", 9));

/** Builds a state directly so each test controls exactly which cards are where. */
function makeState(
  hands: Record<string, UnoCard[]>,
  overrides: Partial<Omit<UnoState, "options">> & { options?: Partial<UnoOptions> } = {},
): UnoState {
  const { options, ...rest } = overrides;
  return {
    options: { ...DEFAULT_UNO_OPTIONS, ...options },
    players: Object.keys(hands),
    hands,
    drawPile: filler(20),
    discardPile: [num("red", 5)],
    currentColor: "red",
    currentIndex: 0,
    direction: 1,
    pendingDraw: 0,
    drawnCardId: null,
    winner: null,
    rngState: 1,
    ...rest,
  };
}

const play = (s: UnoState, player: string, move: UnoMove) => playMove(uno, s, player, move);
const current = (s: UnoState) => s.players[s.currentIndex];
const handSize = (s: UnoState, p: string) => s.hands[p]!.length;

describe("deck", () => {
  it("has the standard 108 cards", () => {
    const deck = createUnoDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map((c) => c.id)).size).toBe(108);
    expect(deck.filter((c) => c.kind === "number")).toHaveLength(76);
    expect(deck.filter((c) => c.kind === "wild")).toHaveLength(4);
    expect(deck.filter((c) => c.kind === "wildDrawFour")).toHaveLength(4);
    for (const kind of ["skip", "reverse", "drawTwo"]) {
      expect(deck.filter((c) => c.kind === kind)).toHaveLength(8);
    }
  });
});

describe("setup", () => {
  it("deals hands and starts on a number card", () => {
    const s = startGame(uno, { players: ["a", "b", "c"], seed: 123 });
    expect(s.players.map((p) => handSize(s, p))).toEqual([7, 7, 7]);
    expect(s.discardPile).toHaveLength(1);
    expect(s.discardPile[0]!.kind).toBe("number");
    expect(s.drawPile.length + s.discardPile.length + 21).toBe(108);
  });

  it("is deterministic for a seed", () => {
    const a = startGame(uno, { players: ["a", "b"], seed: 9 });
    const b = startGame(uno, { players: ["a", "b"], seed: 9 });
    const c = startGame(uno, { players: ["a", "b"], seed: 10 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("rejects bad player counts and hand sizes", () => {
    expect(() => startGame(uno, { players: ["a"], seed: 1 })).toThrow(RangeError);
    expect(() => startGame(uno, { players: ["a", "a"], seed: 1 })).toThrow();
    expect(() =>
      startGame(uno, { players: ["a", "b"], options: { handSize: 60 }, seed: 1 }),
    ).toThrow(RangeError);
  });
});

describe("basic play", () => {
  it("accepts a matching color or number and passes the turn", () => {
    const red = num("red", 2);
    const blue2 = num("blue", 2);
    let s = makeState({ a: [red, ...filler(3)], b: [blue2, ...filler(3)] });
    s = play(s, "a", { type: "play", cardId: red.id });
    expect(current(s)).toBe("b");
    s = play(s, "b", { type: "play", cardId: blue2.id });
    expect(s.currentColor).toBe("blue");
    expect(current(s)).toBe("a");
  });

  it("matches a number to a number of another color", () => {
    const s = makeState({ a: [num("blue", 5), ...filler(2)], b: filler(3) });
    expect(play(s, "a", { type: "play", cardId: s.hands.a![0]!.id }).currentColor).toBe("blue");
  });

  it("rejects a non-matching card, out-of-turn play and unknown cards", () => {
    const blue = num("blue", 3);
    const s = makeState({ a: [blue, ...filler(2)], b: [num("red", 1), ...filler(2)] });
    expect(() => play(s, "a", { type: "play", cardId: blue.id })).toThrow(InvalidMoveError);
    expect(() => play(s, "b", { type: "play", cardId: s.hands.b![0]!.id })).toThrow(
      /not your turn/,
    );
    expect(() => play(s, "a", { type: "play", cardId: "nope" })).toThrow(/not in your hand/);
  });

  it("requires a color for wild cards and sets it", () => {
    const w = wild();
    const s = makeState({ a: [w, ...filler(2)], b: filler(3) });
    expect(() => play(s, "a", { type: "play", cardId: w.id })).toThrow(/choose a color/);
    expect(play(s, "a", { type: "play", cardId: w.id, color: "blue" }).currentColor).toBe("blue");
  });

  it("does not mutate the previous state", () => {
    const red = num("red", 2);
    const s = makeState({ a: [red, ...filler(2)], b: filler(3) });
    const before = structuredClone(s);
    play(s, "a", { type: "play", cardId: red.id });
    expect(s).toEqual(before);
  });
});

describe("action cards", () => {
  it("skip skips the next player", () => {
    const skip = action("red", "skip");
    const s = makeState({ a: [skip, ...filler(2)], b: filler(3), c: filler(3) });
    expect(current(play(s, "a", { type: "play", cardId: skip.id }))).toBe("c");
  });

  it("reverse flips direction with 3+ players", () => {
    const rev = action("red", "reverse");
    const s = play(makeState({ a: [rev, ...filler(2)], b: filler(3), c: filler(3) }), "a", {
      type: "play",
      cardId: rev.id,
    });
    expect(s.direction).toBe(-1);
    expect(current(s)).toBe("c");
  });

  it("reverse acts as skip with 2 players", () => {
    const rev = action("red", "reverse");
    const s = makeState({ a: [rev, ...filler(2)], b: filler(3) });
    expect(current(play(s, "a", { type: "play", cardId: rev.id }))).toBe("a");
  });

  it("draw two makes the next player draw 2 and lose their turn", () => {
    const d2 = action("red", "drawTwo");
    const s = play(makeState({ a: [d2, ...filler(2)], b: filler(3), c: filler(3) }), "a", {
      type: "play",
      cardId: d2.id,
    });
    expect(handSize(s, "b")).toBe(5);
    expect(current(s)).toBe("c");
  });

  it("wild draw four makes the next player draw 4 and lose their turn", () => {
    const w4 = wild("wildDrawFour");
    const s = play(makeState({ a: [w4, ...filler(2)], b: filler(3), c: filler(3) }), "a", {
      type: "play",
      cardId: w4.id,
      color: "yellow",
    });
    expect(handSize(s, "b")).toBe(7);
    expect(s.currentColor).toBe("yellow");
    expect(current(s)).toBe("c");
  });
});

describe("drawing", () => {
  it("lets you play a playable drawn card or pass", () => {
    const drawnRed = num("red", 8);
    const s = play(makeState({ a: filler(3), b: filler(3) }, { drawPile: [drawnRed] }), "a", {
      type: "draw",
    });
    expect(current(s)).toBe("a");
    expect(s.drawnCardId).toBe(drawnRed.id);
    expect(() => play(s, "a", { type: "play", cardId: s.hands.a![0]!.id })).toThrow(
      /card you drew/,
    );
    expect(() => play(s, "a", { type: "draw" })).toThrow(/already drew/);
    expect(current(play(s, "a", { type: "pass" }))).toBe("b");
    expect(current(play(s, "a", { type: "play", cardId: drawnRed.id }))).toBe("b");
  });

  it("ends the turn automatically when the drawn card is not playable", () => {
    const s = play(makeState({ a: filler(3), b: filler(3) }, { drawPile: [num("blue", 1)] }), "a", {
      type: "draw",
    });
    expect(handSize(s, "a")).toBe(4);
    expect(current(s)).toBe("b");
  });

  it("only allows passing after drawing", () => {
    const s = makeState({ a: filler(3), b: filler(3) });
    expect(() => play(s, "a", { type: "pass" })).toThrow(/after drawing/);
  });

  it("draws until playable when that rule is on", () => {
    const s = play(
      makeState(
        { a: filler(3), b: filler(3) },
        {
          options: { drawUntilPlayable: true },
          drawPile: [num("red", 1), num("blue", 2), num("blue", 3)],
        },
      ),
      "a",
      { type: "draw" },
    );
    expect(handSize(s, "a")).toBe(6);
    expect(s.drawnCardId).not.toBeNull();
  });

  it("reshuffles the discard pile but keeps the top card", () => {
    const top = num("red", 5);
    const under = [num("blue", 1), num("blue", 2)];
    const s = play(
      makeState({ a: filler(3), b: filler(3) }, { drawPile: [], discardPile: [...under, top] }),
      "a",
      { type: "draw" },
    );
    expect(s.discardPile).toEqual([top]);
    expect(handSize(s, "a") + s.drawPile.length).toBe(5);
  });
});

describe("UNO and winning", () => {
  it("penalizes going down to one card without declaring UNO", () => {
    const [r1, r2] = [num("red", 1), num("red", 2)];
    const s = makeState({ a: [r1, r2], b: filler(3) });
    expect(handSize(play(s, "a", { type: "play", cardId: r1.id }), "a")).toBe(3);
    expect(handSize(play(s, "a", { type: "play", cardId: r1.id, uno: true }), "a")).toBe(1);
  });

  it("ends the game when a hand is empty and scores the other hands", () => {
    const last = num("red", 1);
    const s = play(
      makeState({ a: [last], b: [num("blue", 7), action("blue", "skip")], c: [wild()] }),
      "a",
      { type: "play", cardId: last.id },
    );
    expect(uno.result(s)).toEqual({ outcome: "win", winners: ["a"], scores: { a: 77 } });
    expect(uno.activePlayers(s)).toEqual([]);
    expect(() => play(s, "b", { type: "draw" })).toThrow(/game is over/);
  });
});

describe("stacking variant", () => {
  it("stacks +2s and the next player draws the total", () => {
    const [d2a, d2b] = [action("red", "drawTwo"), action("blue", "drawTwo")];
    let s = makeState(
      { a: [d2a, ...filler(2)], b: [d2b, ...filler(2)], c: filler(3) },
      { options: { stacking: true } },
    );
    s = play(s, "a", { type: "play", cardId: d2a.id });
    expect(s.pendingDraw).toBe(2);
    expect(() => play(s, "b", { type: "play", cardId: s.hands.b![1]!.id })).toThrow();
    s = play(s, "b", { type: "play", cardId: d2b.id });
    expect(s.pendingDraw).toBe(4);
    expect(uno.legalMoves(s, "c")).toEqual([{ type: "draw" }]);
    s = play(s, "c", { type: "draw" });
    expect(handSize(s, "c")).toBe(7);
    expect(s.pendingDraw).toBe(0);
    expect(current(s)).toBe("a");
  });

  it("allows +4 on +2 but not +2 on +4", () => {
    const w4 = wild("wildDrawFour");
    const d2 = action("red", "drawTwo");
    const s = makeState(
      { a: [w4, ...filler(2)], b: [d2, ...filler(2)] },
      { options: { stacking: true }, pendingDraw: 2, discardPile: [action("red", "drawTwo")] },
    );
    expect(play(s, "a", { type: "play", cardId: w4.id, color: "red" }).pendingDraw).toBe(6);
    const onFour = makeState(
      { a: [d2, ...filler(2)], b: filler(3) },
      { options: { stacking: true }, pendingDraw: 4, discardPile: [wild("wildDrawFour")] },
    );
    expect(() => play(onFour, "a", { type: "play", cardId: d2.id })).toThrow();
  });
});

describe("7-0 variant", () => {
  it("a 7 swaps hands with the chosen player", () => {
    const seven = num("red", 7);
    const aRest = filler(2);
    const bHand = [num("blue", 1)];
    const s = makeState(
      { a: [seven, ...aRest], b: bHand, c: filler(3) },
      { options: { sevenZero: true } },
    );
    expect(() => play(s, "a", { type: "play", cardId: seven.id })).toThrow(/swap/);
    const after = play(s, "a", { type: "play", cardId: seven.id, target: "b" });
    expect(after.hands.a).toEqual(bHand);
    expect(after.hands.b).toEqual(aRest);
  });

  it("a 0 passes every hand to the next player", () => {
    const zero = num("red", 0);
    const [bHand, cHand] = [[num("blue", 1)], [num("blue", 2)]];
    const after = play(
      makeState({ a: [zero, ...filler(2)], b: bHand, c: cHand }, { options: { sevenZero: true } }),
      "a",
      { type: "play", cardId: zero.id },
    );
    expect(after.hands.b).toHaveLength(2);
    expect(after.hands.c).toEqual(bHand);
    expect(after.hands.a).toEqual(cHand);
  });
});

describe("jump-in variant", () => {
  it("lets a player with an identical card play out of turn", () => {
    const top = num("red", 5);
    const same = num("red", 5);
    const s = makeState(
      { a: filler(3), b: filler(3), c: [same, ...filler(2)] },
      { options: { jumpIn: true }, discardPile: [top] },
    );
    expect(uno.activePlayers(s)).toEqual(["a", "c"]);
    expect(current(play(s, "c", { type: "play", cardId: same.id }))).toBe("a");
  });

  it("rejects non-identical cards and is off by default", () => {
    const blue5 = num("blue", 5);
    const s = makeState({ a: filler(3), b: [blue5, ...filler(2)] }, { options: { jumpIn: true } });
    expect(() => play(s, "b", { type: "play", cardId: blue5.id })).toThrow(/identical/);
    const same = num("red", 5);
    const off = makeState({ a: filler(3), b: [same, ...filler(2)] });
    expect(() => play(off, "b", { type: "play", cardId: same.id })).toThrow(/not your turn/);
  });
});

describe("player view", () => {
  it("shows only your own hand", () => {
    const s = startGame(uno, { players: ["a", "b", "c"], seed: 5 });
    const view = uno.playerView(s, "b");
    expect(view.hand).toEqual(s.hands.b);
    expect(view.players.map((p) => p.cardCount)).toEqual([7, 7, 7]);
    const serialized = JSON.stringify(view);
    for (const card of [...s.hands.a!, ...s.hands.c!, ...s.drawPile]) {
      expect(serialized).not.toContain(`"${card.id}"`);
    }
    expect(uno.playerView(s, null).hand).toEqual([]);
  });
});
