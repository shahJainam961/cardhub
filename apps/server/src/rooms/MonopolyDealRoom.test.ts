import type { MonopolyDealMove } from "@cardhub/engine";
import { MONOPOLY_DEAL_ROOM, type DealRoomSnapshot } from "@cardhub/shared";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../app";
import { track, type Player } from "../test/roomClient";
import { GameRoom } from "./GameRoom";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  GameRoom.config = { port: 0, supabase: null };
  colyseus = await boot(createServer());
});
afterEach(() => {
  GameRoom.seedForTests = null;
  return colyseus.cleanup();
});

const FULL_GAME_SEED = 1;
afterAll(() => colyseus.shutdown());

async function createRoom(name: string) {
  const player = track<DealRoomSnapshot>(
    await colyseus.sdk.create(MONOPOLY_DEAL_ROOM, { devName: name, botDelayMs: 0 }),
  );
  await player.waitFor(() => true);
  return player;
}

async function joinRoom(code: string, name: string) {
  const player = track<DealRoomSnapshot>(await colyseus.sdk.joinById(code, { devName: name }));
  await player.waitFor(() => true);
  return player;
}

/** Responds whenever it's this player's move: pays, accepts, discards, else plays or ends the turn. */
function autoplay(player: Player<DealRoomSnapshot>, outOfTurn: { count: number }) {
  player.room.onMessage("snapshot", (s: DealRoomSnapshot) => {
    if (s.phase !== "playing" || s.view?.awaiting !== s.you || s.legalMoves.length === 0) return;
    // Asked to respond (pay or Just Say No) during someone else's turn.
    if (s.view.currentPlayer !== s.you) outOfTurn.count++;
    const pick = (type: MonopolyDealMove["type"]) => s.legalMoves.find((m) => m.type === type);
    const move =
      pick("pay") ??
      pick("accept") ??
      pick("discard") ??
      pick("property") ??
      (s.view.playsLeft > 0 ? pick("bank") : undefined) ??
      pick("endTurn") ??
      s.legalMoves[0]!;
    player.room.send("move", move);
  });
}

describe("MonopolyDealRoom", () => {
  it("creates a lobby with the official rules only", async () => {
    const ana = await createRoom("Ana");
    expect(ana.latest()).toMatchObject({ phase: "lobby", options: { setsToWin: 3, handLimit: 7 } });
    ana.room.send("setOptions", { setsToWin: 1 });
    ana.room.send("addBot", { level: "hard" });
    const withBot = await ana.waitFor((s) => s.seats.length === 2);
    expect(withBot.options.setsToWin).toBe(3);
    // Unknown levels fall back to normal.
    expect(withBot.seats[1]).toMatchObject({ kind: "bot", level: "normal" });
  });

  it("sends each player only their own hand", async () => {
    const ana = await createRoom("Ana");
    const ben = await joinRoom(ana.latest().code, "Ben");
    ana.room.send("start", {});
    const [a, b] = await Promise.all([
      ana.waitFor((s) => s.phase === "playing"),
      ben.waitFor((s) => s.phase === "playing"),
    ]);
    expect(a.view?.hand).toHaveLength(7);
    expect(b.view?.hand).toHaveLength(5);
    const benJson = JSON.stringify(b);
    for (const card of a.view!.hand) expect(benJson).not.toContain(`"${card.id}"`);
  });

  it("rejects malformed and out-of-turn moves", async () => {
    const ana = await createRoom("Ana");
    const ben = await joinRoom(ana.latest().code, "Ben");
    ana.room.send("start", {});
    await ben.waitFor((s) => s.phase === "playing");

    const malformed = ben.waitForError();
    ben.room.send("move", { type: "rent", cardId: "x", color: "chartreuse" });
    expect(await malformed).toMatch(/malformed/);

    const outOfTurn = ben.waitForError();
    ben.room.send("move", { type: "endTurn" });
    expect(await outOfTurn).toMatch(/not your turn/);
  });

  it("plays a full game with a bot, asking clients to respond during others' turns", async () => {
    // A fixed deal in which the bot charges the humans, so they must answer during its turn.
    GameRoom.seedForTests = () => FULL_GAME_SEED;
    const ana = await createRoom("Ana");
    const ben = await joinRoom(ana.latest().code, "Ben");
    const outOfTurn = { count: 0 };
    autoplay(ana, outOfTurn);
    autoplay(ben, outOfTurn);
    ana.room.send("addBot", {});
    await ana.waitFor((s) => s.seats.length === 3);
    ana.room.send("start", {});

    const [a, b] = await Promise.all([
      ana.waitFor((s) => s.phase === "finished", 60_000),
      ben.waitFor((s) => s.phase === "finished", 60_000),
    ]);
    expect(a.result).not.toBeNull();
    expect(b.result).toEqual(a.result);
    // Rent, debts and steals ask the targeted client to pay or respond out of turn.
    expect(outOfTurn.count).toBeGreaterThan(0);
    GameRoom.seedForTests = null;
  }, 90_000);
});
