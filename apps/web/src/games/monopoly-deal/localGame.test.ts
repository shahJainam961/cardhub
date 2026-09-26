import { monopolyDeal, type DealCard, type MonopolyDealState } from "@cardhub/engine";
import { describe, expect, it } from "vitest";
import {
  applyLocalMove,
  awaitingPlayer,
  createLocalDealGame,
  nextBotAction,
  pendingHandoff,
  revealHand,
  type LocalDealGame,
  type Seat,
} from "./localGame";

const human = (id: string): Seat => ({
  id,
  name: id.toUpperCase(),
  kind: "human",
  level: "normal",
});
const bot = (id: string): Seat => ({ id, name: id.toUpperCase(), kind: "bot", level: "normal" });

let n = 0;
const money = (value: number): DealCard => ({ id: `m${n++}`, kind: "money", value });
const debtCollector = (): DealCard => ({
  id: `a${n++}`,
  kind: "action",
  action: "debtCollector",
  value: 3,
});

/** Replaces the dealt game with a hand-built position (two tables, A to move). */
function withState(game: LocalDealGame, patch: (s: MonopolyDealState) => void): LocalDealGame {
  const state = structuredClone(game.state);
  patch(state);
  return { ...game, state };
}

describe("local Monopoly Deal game", () => {
  it("shows the only human's cards from the start", () => {
    const game = createLocalDealGame([human("a"), bot("b")], { seed: 1, botSpeed: 0 });
    expect(game.revealedFor).toBe("a");
    expect(pendingHandoff(game)).toBeNull();
  });

  it("hands the device to another human who has to pay, mid-turn", () => {
    const debt = debtCollector();
    let game = createLocalDealGame([human("a"), human("b")], { seed: 1, botSpeed: 0 });
    game = revealHand(game, "a");
    game = withState(game, (s) => {
      s.hands.a = [debt];
      s.hands.b = [];
      s.tables.b!.bank = [money(5), money(2)];
    });

    game = applyLocalMove(game, "a", { type: "debtCollector", cardId: debt.id, target: "b" });
    expect(awaitingPlayer(game)).toBe("b");
    expect(pendingHandoff(game)).toBe("b");

    game = revealHand(game, "b");
    const five = game.state.tables.b!.bank[0]!;
    game = applyLocalMove(game, "b", { type: "pay", cardIds: [five.id] });
    // Back to A's turn, so the device goes back to A.
    expect(awaitingPlayer(game)).toBe("a");
    expect(pendingHandoff(game)).toBe("a");
  });

  it("logs the move and every card that changed hands", () => {
    const debt = debtCollector();
    let game = createLocalDealGame([human("a"), bot("b")], { seed: 1, botSpeed: 0 });
    game = withState(game, (s) => {
      s.hands.a = [debt];
      s.tables.b!.bank = [money(3)];
    });
    game = applyLocalMove(game, "a", { type: "debtCollector", cardId: debt.id, target: "b" });
    expect(game.log).toEqual(["A used Debt Collector on B (5M)", "B gave A: 3M"]);
  });

  it("gives bots a human-like, varied pause (or none in tests)", () => {
    const slow = createLocalDealGame([bot("a"), human("b")], { seed: 3, botSpeed: 1 });
    const action = nextBotAction(slow)!;
    expect(action.player).toBe("a");
    expect(action.delayMs).toBeGreaterThan(250);
    expect(action.delayMs).toBeLessThan(2_100);
    expect(nextBotAction({ ...slow, botSpeed: 0 })!.delayMs).toBe(0);
  });

  it("plays a bots-only game to the end", () => {
    let game = createLocalDealGame([bot("a"), bot("b"), bot("c")], { seed: 9, botSpeed: 0 });
    for (let i = 0; i < 5_000 && !monopolyDeal.result(game.state); i++) {
      const action = nextBotAction(game)!;
      game = applyLocalMove(game, action.player, action.move);
    }
    expect(monopolyDeal.result(game.state)).not.toBeNull();
    expect(game.log.length).toBeGreaterThan(10);
  });
});
