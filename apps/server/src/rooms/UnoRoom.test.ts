import type { UnoMove } from "@cardhub/engine";
import { UNO_ROOM, type UnoRoomSnapshot } from "@cardhub/shared";
import type { Room as ClientRoom } from "@colyseus/sdk";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../app";
import { UnoRoom } from "./UnoRoom";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  UnoRoom.config = { port: 0, supabase: null };
  colyseus = await boot(createServer());
});
afterEach(() => colyseus.cleanup());
afterAll(() => colyseus.shutdown());

/** A connected test player that records every snapshot and error it receives. */
interface Player {
  room: ClientRoom;
  snapshots: UnoRoomSnapshot[];
  errors: string[];
  latest(): UnoRoomSnapshot;
  /** Resolves with the next snapshot (or the current one) matching `predicate`. */
  waitFor(predicate: (s: UnoRoomSnapshot) => boolean, timeoutMs?: number): Promise<UnoRoomSnapshot>;
  waitForError(): Promise<string>;
}

function track(room: ClientRoom): Player {
  const snapshots: UnoRoomSnapshot[] = [];
  const errors: string[] = [];
  const listeners = new Set<() => void>();
  room.onMessage("snapshot", (s: UnoRoomSnapshot) => {
    snapshots.push(s);
    listeners.forEach((l) => l());
  });
  room.onMessage("error", (e: { message: string }) => {
    errors.push(e.message);
    listeners.forEach((l) => l());
  });
  const until = <T>(check: () => T | undefined, timeoutMs = 5_000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error("Timed out waiting for the server"));
      }, timeoutMs);
      const listener = () => {
        const value = check();
        if (value === undefined) return;
        clearTimeout(timer);
        listeners.delete(listener);
        resolve(value);
      };
      listeners.add(listener);
      listener();
    });
  return {
    room,
    snapshots,
    errors,
    latest: () => snapshots.at(-1)!,
    // Checks the latest snapshot now and then each new one as it arrives, so it never
    // matches a stale snapshot from earlier in the game.
    waitFor: (predicate, timeoutMs) =>
      until(() => {
        const latest = snapshots.at(-1);
        return latest && predicate(latest) ? latest : undefined;
      }, timeoutMs),
    waitForError: () => {
      const seen = errors.length;
      return until(() => errors[seen]);
    },
  };
}

async function createRoom(name: string, options: Record<string, unknown> = {}) {
  const room = await colyseus.sdk.create(UNO_ROOM, { devName: name, botDelayMs: 0, ...options });
  const player = track(room);
  await player.waitFor(() => true);
  return player;
}

async function joinRoom(code: string, name: string) {
  const player = track(await colyseus.sdk.joinById(code, { devName: name }));
  await player.waitFor(() => true);
  return player;
}

/** Plays for this player whenever it is their turn: first playable card, else draw, else pass. */
function autoplay(player: Player) {
  player.room.onMessage("snapshot", (s: UnoRoomSnapshot) => {
    if (s.phase !== "playing" || s.view?.currentPlayer !== s.you) return;
    const move: UnoMove | undefined =
      s.legalMoves.find((m) => m.type === "play") ??
      s.legalMoves.find((m) => m.type === "draw") ??
      s.legalMoves.find((m) => m.type === "pass");
    if (move) player.room.send("move", move);
  });
}

describe("UnoRoom lobby", () => {
  it("creates a room with a short code and makes the creator host", async () => {
    const ana = await createRoom("Ana");
    const snapshot = ana.latest();
    expect(snapshot.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(snapshot.phase).toBe("lobby");
    expect(snapshot.seats).toEqual([
      expect.objectContaining({ name: "Ana", isHost: true, kind: "human" }),
    ]);
  });

  it("lets friends join by code and shows everyone the same table", async () => {
    const ana = await createRoom("Ana");
    const ben = await joinRoom(ana.latest().code, "Ben");
    await ana.waitFor((s) => s.seats.length === 2);
    expect(ben.latest().seats.map((s) => [s.name, s.isHost])).toEqual([
      ["Ana", true],
      ["Ben", false],
    ]);
  });

  it("only lets the host change the table", async () => {
    const ana = await createRoom("Ana");
    const ben = await joinRoom(ana.latest().code, "Ben");

    const denied = ben.waitForError();
    ben.room.send("addBot", { level: "easy" });
    expect(await denied).toMatch(/only the host/);

    ana.room.send("addBot", { level: "easy" });
    ana.room.send("setOptions", { stacking: true, handSize: 50 });
    const updated = await ben.waitFor((s) => s.seats.length === 3 && s.options.stacking);
    expect(updated.seats[2]).toMatchObject({ kind: "bot", level: "easy", name: "Bot 1" });
    expect(updated.options.handSize).toBe(7);
  });

  it("needs at least two players to start", async () => {
    const ana = await createRoom("Ana");
    const error = ana.waitForError();
    ana.room.send("start", {});
    expect(await error).toMatch(/at least 2/);
  });

  it("gives duplicate names a suffix", async () => {
    const ana = await createRoom("Sam");
    ana.room.send("addBot", {});
    const code = ana.latest().code;
    await ana.waitFor((s) => s.seats.length === 2);
    const other = await joinRoom(code, "Bot 1");
    expect(other.latest().seats.map((s) => s.name)).toEqual(["Sam", "Bot 1", "Bot 1 (2)"]);
  });
});

describe("UnoRoom game", () => {
  it("sends each player only their own hand", async () => {
    const ana = await createRoom("Ana");
    const ben = await joinRoom(ana.latest().code, "Ben");
    ana.room.send("start", {});
    const [a, b] = await Promise.all([
      ana.waitFor((s) => s.phase === "playing"),
      ben.waitFor((s) => s.phase === "playing"),
    ]);
    expect(a.view?.hand).toHaveLength(7);
    const anaCards = new Set(a.view!.hand.map((c) => c.id));
    expect(JSON.stringify(b)).not.toMatch(
      new RegExp([...anaCards].map((id) => `"${id}"`).join("|")),
    );
    expect(b.view?.players.find((p) => p.id === a.you)?.cardCount).toBe(7);
  });

  it("rejects malformed and out-of-turn moves without changing the game", async () => {
    const ana = await createRoom("Ana");
    const ben = await joinRoom(ana.latest().code, "Ben");
    ana.room.send("start", {});
    const start = await ben.waitFor((s) => s.phase === "playing");
    const waiting = start.view!.currentPlayer === start.you ? ana : ben;

    const malformed = waiting.waitForError();
    waiting.room.send("move", { type: "explode" });
    expect(await malformed).toMatch(/malformed/);

    const outOfTurn = waiting.waitForError();
    waiting.room.send("move", { type: "draw" });
    expect(await outOfTurn).toMatch(/not your turn/);
    expect(waiting.latest().moveCount).toBe(0);
  });

  it("refuses new players once the game has started", async () => {
    const ana = await createRoom("Ana");
    ana.room.send("addBot", {});
    await ana.waitFor((s) => s.seats.length === 2);
    ana.room.send("start", {});
    await ana.waitFor((s) => s.phase === "playing");
    await expect(joinRoom(ana.latest().code, "Late")).rejects.toThrow(/already started/);
  });

  it("plays a full game between two players and a bot, then plays again", async () => {
    const ana = await createRoom("Ana");
    const ben = await joinRoom(ana.latest().code, "Ben");
    autoplay(ana);
    autoplay(ben);
    ana.room.send("addBot", {});
    await ana.waitFor((s) => s.seats.length === 3);
    ana.room.send("start", {});

    const [finishedA, finishedB] = await Promise.all([
      ana.waitFor((s) => s.phase === "finished", 20_000),
      ben.waitFor((s) => s.phase === "finished", 20_000),
    ]);
    expect(finishedA.result?.outcome).toBe("win");
    expect(finishedB.result).toEqual(finishedA.result);
    expect(finishedA.log.length).toBeGreaterThan(0);

    ana.room.send("playAgain", {});
    const again = await ben.waitFor((s) => s.phase === "playing" && s.moveCount === 0);
    expect(again.view?.hand.length).toBeGreaterThan(0);
  }, 30_000);

  it("hands a leaving player's seat to a bot and moves the host role", async () => {
    const ana = await createRoom("Ana");
    const ben = await joinRoom(ana.latest().code, "Ben");
    autoplay(ben);
    ana.room.send("start", {});
    await ben.waitFor((s) => s.phase === "playing");

    await ana.room.leave(true);
    const after = await ben.waitFor((s) => s.seats[0]?.kind === "bot");
    expect(after.seats[1]).toMatchObject({ name: "Ben", isHost: true });
    // Ben autoplays and the bot covers Ana, so the game still finishes.
    await ben.waitFor((s) => s.phase === "finished", 20_000);
  }, 30_000);

  it("lets a player who left rejoin and take their seat back", async () => {
    const ana = await createRoom("Ana");
    const ben = await joinRoom(ana.latest().code, "Ben");
    ana.room.send("start", {});
    await ben.waitFor((s) => s.phase === "playing");

    await ben.room.leave(true);
    await ana.waitFor((s) => s.seats[1]?.kind === "bot");
    const back = await joinRoom(ana.latest().code, "Ben");
    expect(back.latest().seats[1]).toMatchObject({ name: "Ben", kind: "human", connected: true });
    expect(back.latest().view?.hand.length).toBeGreaterThan(0);
  });
});
