import { InvalidMoveError, uno, type UnoCard } from "@cardhub/engine";
import { describe, expect, it } from "vitest";
import {
  applyLocalMove,
  createLocalUnoGame,
  currentPlayer,
  nextBotAction,
  pendingHandoff,
  revealHand,
  type LocalUnoGame,
  type Seat,
} from "./localGame";

const human = (id: string): Seat => ({
  id,
  name: id.toUpperCase(),
  kind: "human",
  level: "normal",
});
const bot = (id: string, level: Seat["level"] = "normal"): Seat => ({
  id,
  name: id.toUpperCase(),
  kind: "bot",
  level,
});

const create = (seats: Seat[], seed = 1) => createLocalUnoGame(seats, {}, { seed, botDelayMs: 0 });

/** Draws for the current player until the turn passes, whatever the drawn card is. */
function drawAndPass(game: LocalUnoGame): LocalUnoGame {
  const player = currentPlayer(game.state);
  let next = applyLocalMove(game, player, { type: "draw" });
  if (next.state.drawnCardId) next = applyLocalMove(next, player, { type: "pass" });
  return next;
}

describe("local uno game", () => {
  it("shows the only human's hand from the start", () => {
    expect(create([human("a"), bot("b")]).revealedFor).toBe("a");
  });

  it("asks for a handoff between humans before revealing a hand", () => {
    let game = create([human("a"), human("b")]);
    expect(game.revealedFor).toBeNull();
    expect(pendingHandoff(game)).toBe("a");

    game = revealHand(game, "a");
    expect(pendingHandoff(game)).toBeNull();

    game = drawAndPass(game);
    expect(currentPlayer(game.state)).toBe("b");
    expect(pendingHandoff(game)).toBe("b");
  });

  it("never asks for a handoff with a single human", () => {
    let game = create([human("a"), bot("b")]);
    game = drawAndPass(game);
    expect(pendingHandoff(game)).toBeNull();
  });

  it("logs moves in plain language", () => {
    const game = drawAndPass(create([human("a"), bot("b")]));
    expect(game.log[0]).toMatch(/^A drew a card$/);
    expect(game.moveCount).toBeGreaterThanOrEqual(1);
  });

  it("logs a forgotten UNO call", () => {
    let game = create([human("a"), bot("b")]);
    const top = game.state.discardPile.at(-1)!;
    const match: UnoCard = { id: "m", kind: "wild" };
    game = {
      ...game,
      state: { ...game.state, hands: { ...game.state.hands, a: [match, { ...top, id: "x" }] } },
    };
    game = applyLocalMove(game, "a", { type: "play", cardId: "m", color: "red" });
    expect(game.log.at(-1)).toBe("A played Wild and chose red, but forgot to call UNO (+2)");
  });

  it("rejects illegal moves", () => {
    const game = create([human("a"), bot("b")]);
    expect(() => applyLocalMove(game, "b", { type: "draw" })).toThrow(InvalidMoveError);
  });

  it("waits for humans and moves for bots", () => {
    expect(nextBotAction(create([human("a"), bot("b")]))).toBeNull();
    expect(nextBotAction(create([bot("a"), human("b")]))?.player).toBe("a");
  });

  it("plays a full bots-only game to the end", () => {
    let game = create([bot("a", "easy"), bot("b"), bot("c")], 42);
    for (let i = 0; i < 5000 && !uno.result(game.state); i++) {
      const action = nextBotAction(game)!;
      game = applyLocalMove(game, action.player, action.move);
    }
    expect(uno.result(game.state)?.outcome).toBe("win");
  });
});
