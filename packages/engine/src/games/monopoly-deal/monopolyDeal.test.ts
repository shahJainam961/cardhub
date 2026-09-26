import { describe, expect, it } from "vitest";
import { InvalidMoveError, playMove, startGame } from "../../core/play";
import {
  createDealDeck,
  DEAL_DECK_SIZE,
  type ActionKind,
  type DealCard,
  type DealColor,
  type PropertyCard,
  type WildCard,
} from "./cards";
import {
  DEFAULT_MONOPOLY_DEAL_OPTIONS,
  monopolyDeal,
  type MonopolyDealMove,
  type MonopolyDealState,
} from "./monopolyDeal";
import { rentFor, setInfo, type PlayerTable } from "./table";

let nextId = 0;
const id = () => `t${nextId++}`;
const money = (value: number): DealCard => ({ id: id(), kind: "money", value });
const prop = (color: DealColor, value = 2): PropertyCard => ({
  id: id(),
  kind: "property",
  color,
  name: color,
  value,
});
const wild = (colors: DealColor[] | "any", value = colors === "any" ? 0 : 3): WildCard => ({
  id: id(),
  kind: "wild",
  colors,
  value,
});
const action = (kind: ActionKind, value = 3): DealCard => ({
  id: id(),
  kind: "action",
  action: kind,
  value,
});
const rent = (colors: DealColor[] | "any"): DealCard => ({
  id: id(),
  kind: "rent",
  colors,
  value: colors === "any" ? 3 : 1,
});
const filler = (n: number) => Array.from({ length: n }, () => money(1));

type TableSpec = {
  bank?: DealCard[];
  props?: [PropertyCard | WildCard, DealColor?][];
  buildings?: [DealCard, DealColor][];
};
const table = (spec: TableSpec = {}): PlayerTable => ({
  bank: spec.bank ?? [],
  properties: (spec.props ?? []).map(([card, color]) => ({
    card,
    color: color ?? (card.kind === "property" ? card.color : "red"),
  })),
  buildings: (spec.buildings ?? []).map(([card, color]) => ({ card: card as never, color })),
});

/** Builds a mid-turn state directly so each test controls every card. */
function makeState(
  hands: Record<string, DealCard[]>,
  tables: Record<string, PlayerTable> = {},
  overrides: Partial<MonopolyDealState> = {},
): MonopolyDealState {
  const players = Object.keys(hands);
  return {
    options: { ...DEFAULT_MONOPOLY_DEAL_OPTIONS },
    players,
    hands,
    tables: Object.fromEntries(players.map((p) => [p, tables[p] ?? table()])),
    drawPile: filler(30),
    discardPile: [],
    currentIndex: 0,
    playsLeft: 3,
    phase: "play",
    pending: null,
    winner: null,
    stalemate: false,
    rngState: 1,
    ...overrides,
  };
}

const play = (s: MonopolyDealState, player: string, move: MonopolyDealMove) =>
  playMove(monopolyDeal, s, player, move);
const bankTotal = (s: MonopolyDealState, p: string) =>
  s.tables[p]!.bank.reduce((n, c) => n + c.value, 0);
const current = (s: MonopolyDealState) => s.players[s.currentIndex];

describe("deck", () => {
  it("has the standard 106 playable cards", () => {
    const deck = createDealDeck();
    expect(deck).toHaveLength(DEAL_DECK_SIZE);
    expect(new Set(deck.map((c) => c.id)).size).toBe(106);
    const count = (pred: (c: DealCard) => boolean) => deck.filter(pred).length;
    expect(count((c) => c.kind === "money")).toBe(20);
    expect(deck.filter((c) => c.kind === "money").reduce((n, c) => n + c.value, 0)).toBe(57);
    expect(count((c) => c.kind === "property")).toBe(28);
    expect(count((c) => c.kind === "wild")).toBe(11);
    expect(count((c) => c.kind === "rent")).toBe(13);
    expect(count((c) => c.kind === "action")).toBe(34);
    const actions = (kind: ActionKind) => count((c) => c.kind === "action" && c.action === kind);
    expect([
      actions("passGo"),
      actions("dealBreaker"),
      actions("justSayNo"),
      actions("hotel"),
    ]).toEqual([10, 2, 3, 2]);
  });

  it("has exactly one complete set of real properties per color", () => {
    const deck = createDealDeck();
    const sizes = { brown: 2, darkBlue: 2, utility: 2, railroad: 4 } as Record<string, number>;
    for (const color of [
      "brown",
      "lightBlue",
      "purple",
      "orange",
      "red",
      "yellow",
      "green",
      "darkBlue",
      "railroad",
      "utility",
    ]) {
      expect(deck.filter((c) => c.kind === "property" && c.color === color)).toHaveLength(
        sizes[color] ?? 3,
      );
    }
  });
});

describe("setup and turns", () => {
  it("deals 5 and the first player draws 2", () => {
    const s = startGame(monopolyDeal, { players: ["a", "b", "c"], seed: 1 });
    expect(s.hands.a).toHaveLength(7);
    expect(s.hands.b).toHaveLength(5);
    expect(s.drawPile).toHaveLength(106 - 15 - 2);
    expect(() =>
      startGame(monopolyDeal, { players: ["a", "b", "c", "d", "e", "f"], seed: 1 }),
    ).toThrow(RangeError);
  });

  it("draws 2 at the start of a turn, or 5 with an empty hand", () => {
    let s = makeState({ a: filler(3), b: filler(2), c: [] });
    s = play(s, "a", { type: "endTurn" });
    expect(current(s)).toBe("b");
    expect(s.hands.b).toHaveLength(4);
    s = play(s, "b", { type: "endTurn" });
    expect(s.hands.c).toHaveLength(5);
  });

  it("allows at most three plays per turn", () => {
    const cards = filler(4);
    let s = makeState({ a: cards, b: filler(2) });
    for (const card of cards.slice(0, 3)) s = play(s, "a", { type: "bank", cardId: card.id });
    expect(s.playsLeft).toBe(0);
    expect(() => play(s, "a", { type: "bank", cardId: cards[3]!.id })).toThrow(/no plays left/);
  });

  it("makes you discard down to 7 at the end of your turn", () => {
    const hand = filler(9);
    let s = play(makeState({ a: hand, b: filler(2) }), "a", { type: "endTurn" });
    expect(s.phase).toBe("discard");
    expect(() => play(s, "a", { type: "discard", cardIds: [hand[0]!.id] })).toThrow(/exactly 2/);
    s = play(s, "a", { type: "discard", cardIds: [hand[0]!.id, hand[1]!.id] });
    expect(s.hands.a).toHaveLength(7);
    expect(current(s)).toBe("b");
  });

  it("reshuffles the discard pile when the draw pile runs out", () => {
    const s = play(makeState({ a: [], b: [] }, {}, { drawPile: [], discardPile: filler(4) }), "a", {
      type: "endTurn",
    });
    expect(s.hands.b).toHaveLength(4);
    expect(s.discardPile).toEqual([]);
  });

  it("ends in a stalemate when no cards are left anywhere", () => {
    const s = play(makeState({ a: [], b: [] }, {}, { drawPile: [], discardPile: [] }), "a", {
      type: "endTurn",
    });
    expect(monopolyDeal.result(s)).toEqual({ outcome: "draw", winners: [] });
  });
});

describe("bank and properties", () => {
  it("banks money and actions but never properties", () => {
    const [cash, sly, house] = [money(5), action("slyDeal"), prop("red")];
    let s = makeState({ a: [cash, sly, house], b: filler(2) });
    s = play(s, "a", { type: "bank", cardId: cash.id });
    s = play(s, "a", { type: "bank", cardId: sly.id });
    expect(bankTotal(s, "a")).toBe(8);
    expect(() => play(s, "a", { type: "bank", cardId: house.id })).toThrow(/can't go in the bank/);
  });

  it("places wilds as one of their colors and re-colors them for free on your turn", () => {
    const w = wild(["red", "yellow"]);
    let s = makeState({ a: [w], b: filler(2) });
    expect(() => play(s, "a", { type: "property", cardId: w.id, color: "green" })).toThrow(
      /can't be that color/,
    );
    s = play(s, "a", { type: "property", cardId: w.id, color: "red" });
    s = play(s, "a", { type: "moveWild", cardId: w.id, color: "yellow" });
    expect(s.tables.a!.properties[0]!.color).toBe("yellow");
    expect(s.playsLeft).toBe(2);
    s = play(s, "a", { type: "endTurn" });
    expect(() => play(s, "a", { type: "moveWild", cardId: w.id, color: "red" })).toThrow(
      /not your turn/,
    );
  });

  it("never completes a set with only every-color wilds, and they can't charge rent alone", () => {
    const t = table({
      props: [
        [wild("any"), "brown"],
        [wild("any"), "brown"],
      ],
    });
    expect(setInfo(t, "brown")).toEqual({ total: 2, complete: 0, rentCount: 0 });
    expect(rentFor(t, "brown")).toBe(0);
    const withReal = table({ props: [[wild("any"), "brown"], [prop("brown")]] });
    expect(setInfo(withReal, "brown").complete).toBe(1);
  });
});

describe("rent", () => {
  const redSet = () => table({ props: [[prop("red")], [prop("red")], [prop("red")]] });

  it("two-color rent charges every other player for one color you own", () => {
    const r = rent(["red", "yellow"]);
    let s = makeState(
      { a: [r], b: [], c: [] },
      { a: redSet(), b: table({ bank: [money(10)] }), c: table({ bank: [money(1)] }) },
    );
    expect(() => play(s, "a", { type: "rent", cardId: r.id, color: "yellow" })).toThrow(
      /need properties/,
    );
    s = play(s, "a", { type: "rent", cardId: r.id, color: "red" });
    // b has more than the 6M owed, so b chooses how to pay; c hands over everything automatically.
    expect(s.pending).toMatchObject({ amount: 6, targets: ["b", "c"], paying: true });
    const tenM = s.tables.b!.bank[0]!;
    s = play(s, "b", { type: "pay", cardIds: [tenM.id] });
    expect(s.pending).toBeNull();
    expect(bankTotal(s, "a")).toBe(11);
  });

  it("wild rent charges one chosen player, doubled by each Double The Rent", () => {
    const [r, d1, d2] = [rent("any"), action("doubleRent", 1), action("doubleRent", 1)];
    const s = play(
      makeState({ a: [r, d1, d2], b: [] }, { a: redSet(), b: table({ bank: filler(30) }) }),
      "a",
      { type: "rent", cardId: r.id, color: "red", target: "b", doubles: [d1.id, d2.id] },
    );
    expect(s.pending?.amount).toBe(24);
    expect(s.playsLeft).toBe(0);
  });

  it("adds 3M for a house and 4M more for a hotel, not on railroads", () => {
    const [house, hotel] = [action("house"), action("hotel", 4)];
    let s = makeState({ a: [hotel, house], b: filler(2) }, { a: redSet() });
    expect(() => play(s, "a", { type: "building", cardId: hotel.id, color: "red" })).toThrow(
      /needs a complete set that has a house/,
    );
    s = play(s, "a", { type: "building", cardId: house.id, color: "red" });
    s = play(s, "a", { type: "building", cardId: hotel.id, color: "red" });
    expect(rentFor(s.tables.a!, "red")).toBe(6 + 3 + 4);

    const rails = table({
      props: [[prop("railroad")], [prop("railroad")], [prop("railroad")], [prop("railroad")]],
    });
    const h = action("house");
    expect(() =>
      play(makeState({ a: [h], b: [] }, { a: rails }), "a", {
        type: "building",
        cardId: h.id,
        color: "railroad",
      }),
    ).toThrow(/railroads and utilities/);
  });
});

describe("paying", () => {
  it("rejects payments with unnecessary cards and never takes cards from the hand", () => {
    const [one, five] = [money(1), money(5)];
    const s = makeState(
      { a: [], b: [money(10)] },
      { b: table({ bank: [one, five] }) },
      {
        pending: {
          kind: "debtCollector",
          actor: "a",
          targets: ["b"],
          amount: 3,
          justSayNos: 0,
          paying: true,
        },
      },
    );
    expect(() => play(s, "b", { type: "pay", cardIds: [one.id, five.id] })).toThrow(
      InvalidMoveError,
    );
    expect(() => play(s, "b", { type: "pay", cardIds: [s.hands.b![0]!.id] })).toThrow(
      InvalidMoveError,
    );
    const paid = play(s, "b", { type: "pay", cardIds: [five.id] });
    expect(bankTotal(paid, "a")).toBe(5);
  });

  it("sends paid properties to the receiver's collection and discards buildings on a broken set", () => {
    const [r1, r2, r3, house] = [prop("red", 3), prop("red", 3), prop("red", 3), action("house")];
    const s = makeState(
      { a: [], b: [] },
      { b: table({ props: [[r1], [r2], [r3]], buildings: [[house, "red"]] }) },
      {
        pending: {
          kind: "debtCollector",
          actor: "a",
          targets: ["b"],
          amount: 3,
          justSayNos: 0,
          paying: true,
        },
      },
    );
    const paid = play(s, "b", { type: "pay", cardIds: [r1.id] });
    expect(paid.tables.a!.properties.map((p) => p.card.id)).toEqual([r1.id]);
    expect(paid.tables.b!.buildings).toEqual([]);
    expect(paid.discardPile).toContainEqual(house);
  });

  it("pays houses and hotels into the receiver's bank", () => {
    const [r1, r2, r3, house] = [prop("red", 3), prop("red", 3), prop("red", 3), action("house")];
    const s = makeState(
      { a: [], b: [] },
      { b: table({ props: [[r1], [r2], [r3]], buildings: [[house, "red"]] }) },
      {
        pending: {
          kind: "debtCollector",
          actor: "a",
          targets: ["b"],
          amount: 3,
          justSayNos: 0,
          paying: true,
        },
      },
    );
    const paid = play(s, "b", { type: "pay", cardIds: [house.id] });
    expect(paid.tables.a!.bank).toEqual([house]);
    expect(setInfo(paid.tables.b!, "red").complete).toBe(1);
  });

  it("hands over everything automatically when it doesn't cover the debt, and every-color wilds can't pay", () => {
    const debt = action("debtCollector");
    const any = wild("any");
    const s = play(
      makeState(
        { a: [debt], b: [] },
        { b: table({ bank: [money(2)], props: [[prop("green", 2)], [any, "green"]] }) },
      ),
      "a",
      { type: "debtCollector", cardId: debt.id, target: "b" },
    );
    expect(s.pending).toBeNull();
    expect(bankTotal(s, "a")).toBe(2);
    expect(s.tables.a!.properties).toHaveLength(1);
    expect(s.tables.b!.properties.map((p) => p.card.id)).toEqual([any.id]);
  });

  it("birthday collects 2M from everyone", () => {
    const bday = action("birthday", 2);
    const s = play(
      makeState(
        { a: [bday], b: [], c: [] },
        { b: table({ bank: [money(2)] }), c: table({ bank: [money(1), money(1)] }) },
      ),
      "a",
      { type: "birthday", cardId: bday.id },
    );
    expect(bankTotal(s, "a")).toBe(4);
  });
});

describe("Just Say No", () => {
  const setup = (actorPlays = 3, actorJsn = true) => {
    const debt = action("debtCollector");
    const aJsn = action("justSayNo", 4);
    const bJsn = action("justSayNo", 4);
    const s = makeState(
      { a: [debt, ...(actorJsn ? [aJsn] : [])], b: [bJsn] },
      { b: table({ bank: [money(10)] }) },
      { playsLeft: actorPlays },
    );
    return { s: play(s, "a", { type: "debtCollector", cardId: debt.id, target: "b" }), aJsn, bJsn };
  };

  it("lets the target cancel an action played against them", () => {
    const { s, bJsn } = setup();
    expect(monopolyDeal.activePlayers(s)).toEqual(["b"]);
    const afterB = play(s, "b", { type: "justSayNo", cardId: bJsn.id });
    expect(monopolyDeal.activePlayers(afterB)).toEqual(["a"]);
    const excused = play(afterB, "a", { type: "accept" });
    expect(excused.pending).toBeNull();
    expect(bankTotal(excused, "b")).toBe(10);
  });

  it("can be countered, and on your own turn it costs a play", () => {
    const { s, aJsn, bJsn } = setup();
    let t = play(s, "b", { type: "justSayNo", cardId: bJsn.id });
    t = play(t, "a", { type: "justSayNo", cardId: aJsn.id });
    expect(t.playsLeft).toBe(1);
    // b has no Just Say No left, so b pays automatically (10M is more than 5M, so b chooses).
    expect(t.pending).toMatchObject({ paying: true, targets: ["b"] });
  });

  it("can't be countered by the current player without plays left", () => {
    const { s, bJsn } = setup(1);
    const t = play(s, "b", { type: "justSayNo", cardId: bJsn.id });
    // The debt collector used the last play, so the actor can't answer and b is excused.
    expect(t.pending).toBeNull();
    expect(bankTotal(t, "b")).toBe(10);
  });

  it("against a two-color rent only excuses the player who used it", () => {
    const r = rent(["red", "yellow"]);
    const jsn = action("justSayNo", 4);
    const reds = table({ props: [[prop("red")], [prop("red")], [prop("red")]] });
    let s = makeState(
      { a: [r], b: [jsn], c: [] },
      { a: reds, b: table({ bank: [money(1)] }), c: table({ bank: [money(1)] }) },
    );
    s = play(s, "a", { type: "rent", cardId: r.id, color: "red" });
    s = play(s, "b", { type: "justSayNo", cardId: jsn.id });
    expect(s.pending).toBeNull();
    expect(bankTotal(s, "b")).toBe(1);
    expect(bankTotal(s, "a")).toBe(1);
  });
});

describe("stealing", () => {
  it("Sly Deal can't take from a complete set but can take an extra card", () => {
    const sly = action("slyDeal");
    const [y1, y2, y3, extra] = [
      prop("yellow"),
      prop("yellow"),
      prop("yellow"),
      wild(["red", "yellow"]),
    ];
    const s = makeState(
      { a: [sly], b: [] },
      { b: table({ props: [[y1], [y2], [y3], [extra, "yellow"]] }) },
    );
    expect(
      play(s, "a", { type: "slyDeal", cardId: sly.id, targetCardId: extra.id }).tables.a!
        .properties,
    ).toHaveLength(1);
    const noExtra = makeState({ a: [sly], b: [] }, { b: table({ props: [[y1], [y2], [y3]] }) });
    expect(() =>
      play(noExtra, "a", { type: "slyDeal", cardId: sly.id, targetCardId: y1.id }),
    ).toThrow(/complete set/);
  });

  it("Forced Deal swaps one property each way", () => {
    const forced = action("forcedDeal");
    const [mine, theirs] = [prop("brown", 1), prop("green", 4)];
    const s = play(
      makeState(
        { a: [forced], b: [] },
        { a: table({ props: [[mine]] }), b: table({ props: [[theirs]] }) },
      ),
      "a",
      { type: "forcedDeal", cardId: forced.id, offeredCardId: mine.id, targetCardId: theirs.id },
    );
    expect(s.tables.a!.properties.map((p) => p.card.id)).toEqual([theirs.id]);
    expect(s.tables.b!.properties.map((p) => p.card.id)).toEqual([mine.id]);
  });

  it("Deal Breaker takes a whole set with its buildings, real properties first", () => {
    const breaker = action("dealBreaker", 5);
    const [g1, g2, gw, house] = [
      prop("green", 4),
      prop("green", 4),
      wild(["darkBlue", "green"], 4),
      action("house"),
    ];
    const [g3] = [prop("green", 4)];
    const s = play(
      makeState(
        { a: [breaker], b: [] },
        { b: table({ props: [[g1], [gw, "green"], [g2], [g3]], buildings: [[house, "green"]] }) },
      ),
      "a",
      { type: "dealBreaker", cardId: breaker.id, target: "b", color: "green" },
    );
    expect(s.tables.a!.properties.map((p) => p.card.id).sort()).toEqual(
      [g1.id, g2.id, g3.id].sort(),
    );
    expect(s.tables.a!.buildings.map((b) => b.card.id)).toEqual([house.id]);
    expect(s.tables.b!.properties.map((p) => p.card.id)).toEqual([gw.id]);
  });
});

describe("winning", () => {
  const set = (color: DealColor, n: number): [PropertyCard][] =>
    Array.from({ length: n }, () => [prop(color)]);

  it("needs three complete sets of different colors", () => {
    const last = prop("red");
    const twoReds = table({ props: [...set("brown", 2), ...set("red", 3), ...set("red", 2)] });
    let s = makeState({ a: [last], b: filler(2) }, { a: twoReds });
    s = play(s, "a", { type: "property", cardId: last.id, color: "red" });
    // Two red sets and a brown set are only two different colors.
    expect(monopolyDeal.result(s)).toBeNull();

    const green = prop("darkBlue");
    s = makeState(
      { a: [green], b: filler(2) },
      { a: table({ props: [...set("brown", 2), ...set("red", 3), ...set("darkBlue", 1)] }) },
    );
    s = play(s, "a", { type: "property", cardId: green.id, color: "darkBlue" });
    expect(monopolyDeal.result(s)).toEqual({ outcome: "win", winners: ["a"] });
    expect(() => play(s, "b", { type: "endTurn" })).toThrow(/game is over/);
  });

  it("can win out of turn by receiving a property as payment", () => {
    const debt = action("debtCollector");
    const blue = prop("darkBlue", 5);
    let s = makeState(
      { a: [debt], b: [] },
      {
        a: table({ props: [...set("brown", 2), ...set("red", 3), ...set("darkBlue", 1)] }),
        b: table({ props: [[blue]] }),
      },
    );
    s = play(s, "a", { type: "debtCollector", cardId: debt.id, target: "b" });
    expect(monopolyDeal.result(s)?.winners).toEqual(["a"]);
  });
});

describe("player view", () => {
  it("shows tables to everyone but hands only to their owner", () => {
    const s = startGame(monopolyDeal, { players: ["a", "b"], seed: 3 });
    const view = monopolyDeal.playerView(s, "b");
    expect(view.hand).toEqual(s.hands.b);
    expect(view.players.map((p) => p.handCount)).toEqual([7, 5]);
    const json = JSON.stringify(view);
    for (const card of [...s.hands.a!, ...s.drawPile]) expect(json).not.toContain(`"${card.id}"`);
  });
});
