import { pickUnoBotAction, type BotLevel } from "@cardhub/bots";
import {
  InvalidMoveError,
  playMove,
  startGame,
  uno,
  type PlayerId,
  type UnoOptions,
  type UnoState,
} from "@cardhub/engine";
import {
  describeUnoMove,
  type CreateOptions,
  type JoinOptions,
  type OnlineSeat,
  type RoomPhase,
  type UnoRoomSnapshot,
} from "@cardhub/shared";
import { Room, ServerError, type Client } from "@colyseus/core";
import { randomInt } from "node:crypto";
import { verifyPlayer, type VerifiedPlayer } from "../auth";
import { readConfig, type ServerConfig } from "../config";
import { claimRoomCode, releaseRoomCode } from "../roomCodes";
import { parseBotLevel, parseHouseRules, parseUnoMove } from "../validation";

const DEFAULT_BOT_DELAY_MS = 700;
const MAX_BOT_DELAY_MS = 2_000;
const MAX_LOG = 50;
/** How long a dropped player keeps their seat before it is handed to a bot (or freed in the lobby). */
const RECONNECT_SECONDS = { lobby: 20, playing: 60 } as const;

interface RoomCreateOptions extends CreateOptions {
  /** Test hook for fast end-to-end runs; clamped to a sane range. */
  botDelayMs?: number;
}

export class UnoRoom extends Room {
  override maxClients = uno.maxPlayers;

  /** Overridable in tests. */
  static config: ServerConfig = readConfig();

  private seats: OnlineSeat[] = [];
  /** The session currently holding each human seat (a rejoin replaces the old one). */
  private sessionOfSeat = new Map<PlayerId, string>();
  private options: UnoOptions = { ...uno.defaultOptions };
  private phase: RoomPhase = "lobby";
  private game: UnoState | null = null;
  private seed = 0;
  private moveCount = 0;
  private log: string[] = [];
  private botCount = 0;
  private botDelayMs = DEFAULT_BOT_DELAY_MS;
  private botTimer: { clear(): void } | null = null;

  override onCreate(options: RoomCreateOptions = {}) {
    this.roomId = claimRoomCode();
    // Rooms are only joinable by code, never through public matchmaking.
    void this.setPrivate(true);
    this.options = { ...uno.defaultOptions, ...parseHouseRules(options.options) };
    if (typeof options.botDelayMs === "number" && Number.isFinite(options.botDelayMs)) {
      this.botDelayMs = Math.min(Math.max(0, options.botDelayMs), MAX_BOT_DELAY_MS);
    }

    this.onMessage("move", (client, payload) =>
      this.guard(client, () => {
        const move = parseUnoMove(payload);
        if (!move) throw new InvalidMoveError("malformed move");
        if (this.phase !== "playing" || !this.game)
          throw new InvalidMoveError("no game in progress");
        this.applyMove(this.seatOf(client).id, move);
      }),
    );
    this.onMessage("setOptions", (client, payload) =>
      this.guard(client, () => {
        this.requireHost(client, "lobby");
        this.options = { ...this.options, ...parseHouseRules(payload) };
      }),
    );
    this.onMessage("addBot", (client, payload) =>
      this.guard(client, () => {
        this.requireHost(client, "lobby");
        if (this.seats.length >= uno.maxPlayers) throw new InvalidMoveError("the table is full");
        this.addBot(parseBotLevel(payload));
      }),
    );
    this.onMessage("removeSeat", (client, payload) =>
      this.guard(client, () => {
        this.requireHost(client, "lobby");
        const seatId = (payload as { seatId?: unknown } | null)?.seatId;
        const seat = this.seats.find((s) => s.id === seatId);
        if (!seat || seat.kind !== "bot") throw new InvalidMoveError("only bots can be removed");
        this.seats = this.seats.filter((s) => s !== seat);
      }),
    );
    this.onMessage("start", (client) =>
      this.guard(client, () => {
        this.requireHost(client, "lobby");
        this.startNewGame();
      }),
    );
    this.onMessage("playAgain", (client) =>
      this.guard(client, () => {
        this.requireHost(client, "finished");
        this.startNewGame();
      }),
    );
  }

  override async onAuth(_client: Client, options: JoinOptions): Promise<VerifiedPlayer> {
    const player = await verifyPlayer(UnoRoom.config, options);
    const existing = this.seats.find((s) => s.id === player.id);
    if (!existing && this.phase !== "lobby")
      throw new ServerError(403, "That game has already started");
    if (!existing && this.seats.length >= uno.maxPlayers)
      throw new ServerError(403, "That table is full");
    return player;
  }

  override onJoin(client: Client) {
    const player = client.auth as VerifiedPlayer;
    const existing = this.seats.find((s) => s.id === player.id);
    if (existing) {
      // Rejoining (e.g. after a page reload) reclaims the seat, even if a bot was covering it.
      existing.kind = "human";
      existing.name = player.name;
      existing.connected = true;
    } else {
      this.seats.push({
        id: player.id,
        name: this.uniqueName(player.name),
        kind: "human",
        level: "normal",
        connected: true,
        isHost: !this.seats.some((s) => s.isHost),
      });
    }
    this.sessionOfSeat.set(player.id, client.sessionId);
    this.sync();
    this.scheduleBots();
  }

  override onDrop(client: Client) {
    const seat = this.heldSeat(client);
    if (!seat) return;
    seat.connected = false;
    this.sync();
    void this.allowReconnection(
      client,
      RECONNECT_SECONDS[this.phase === "lobby" ? "lobby" : "playing"],
    );
  }

  override onReconnect(client: Client) {
    const seat = this.heldSeat(client);
    if (!seat) return;
    seat.connected = true;
    this.sync();
  }

  override onLeave(client: Client) {
    const seat = this.heldSeat(client);
    if (!seat) return;
    this.sessionOfSeat.delete(seat.id);

    if (this.phase === "lobby") {
      this.seats = this.seats.filter((s) => s !== seat);
    } else {
      // Keep the game going: a bot takes over until the player rejoins.
      seat.kind = "bot";
      seat.level = "normal";
      seat.connected = false;
    }
    if (seat.isHost) {
      seat.isHost = false;
      const nextHost = this.seats.find((s) => s.kind === "human" && s.connected);
      if (nextHost) nextHost.isHost = true;
    }
    this.sync();
    this.scheduleBots();
  }

  override onDispose() {
    this.botTimer?.clear();
    releaseRoomCode(this.roomId);
  }

  private startNewGame() {
    if (this.seats.length < uno.minPlayers) {
      throw new InvalidMoveError(`add at least ${uno.minPlayers} players`);
    }
    this.seed = randomInt(2 ** 32);
    this.game = startGame(uno, {
      players: this.seats.map((s) => s.id),
      options: this.options,
      seed: this.seed,
    });
    this.phase = "playing";
    this.moveCount = 0;
    this.log = [];
    this.scheduleBots();
  }

  private applyMove(player: PlayerId, move: ReturnType<typeof parseUnoMove> & object) {
    const before = this.game!;
    const after = playMove(uno, before, player, move);
    this.log = [
      ...this.log,
      describeUnoMove(before, after, player, move, (id) => this.nameOf(id)),
    ].slice(-MAX_LOG);
    this.game = after;
    this.moveCount++;
    if (uno.result(after)) this.phase = "finished";
    this.scheduleBots();
  }

  /** Runs the next bot move after a delay; any other move in the meantime reschedules it. */
  private scheduleBots() {
    this.botTimer?.clear();
    this.botTimer = null;
    if (this.phase !== "playing" || !this.game) return;
    const bots: Record<PlayerId, BotLevel> = Object.fromEntries(
      this.seats.filter((s) => s.kind === "bot").map((s) => [s.id, s.level]),
    );
    const action = pickUnoBotAction(
      this.game,
      bots,
      this.seed + Math.imul(this.moveCount + 1, 0x9e3779b1),
    );
    if (!action) return;
    this.botTimer = this.clock.setTimeout(() => {
      this.botTimer = null;
      this.applyMove(action.player, action.move);
      this.sync();
    }, this.botDelayMs);
  }

  /** Sends every connected player their own snapshot (their hand only). */
  private sync() {
    for (const client of this.clients) {
      const seat = this.heldSeat(client);
      if (seat) client.send("snapshot", this.snapshotFor(seat.id));
    }
  }

  private snapshotFor(player: PlayerId): UnoRoomSnapshot {
    const game = this.game;
    return {
      code: this.roomId,
      phase: this.phase,
      seats: this.seats.map((s) => ({ ...s })),
      you: player,
      options: { ...this.options },
      view: game ? uno.playerView(game, player) : null,
      legalMoves: game && this.phase === "playing" ? uno.legalMoves(game, player) : [],
      moveCount: this.moveCount,
      log: this.log,
      result: game ? uno.result(game) : null,
    };
  }

  /** Runs a client request, replying with an error message instead of crashing the room. */
  private guard(client: Client, action: () => void) {
    try {
      action();
      this.sync();
    } catch (error) {
      if (!(error instanceof InvalidMoveError)) {
        console.error("Unexpected error handling a room message", error);
      }
      const message = error instanceof InvalidMoveError ? error.reason : "Something went wrong";
      client.send("error", { message });
    }
  }

  private requireHost(client: Client, phase: RoomPhase) {
    if (!this.seatOf(client).isHost) throw new InvalidMoveError("only the host can do that");
    if (this.phase !== phase) throw new InvalidMoveError("you can't do that right now");
  }

  /** The human seat this session currently holds, if any. */
  private heldSeat(client: Client): OnlineSeat | undefined {
    const id = (client.auth as VerifiedPlayer | undefined)?.id;
    if (!id || this.sessionOfSeat.get(id) !== client.sessionId) return undefined;
    return this.seats.find((s) => s.id === id);
  }

  private seatOf(client: Client): OnlineSeat {
    const seat = this.heldSeat(client);
    if (!seat) throw new InvalidMoveError("you are not seated in this room");
    return seat;
  }

  private addBot(level: BotLevel) {
    this.botCount++;
    this.seats.push({
      id: `bot-${this.botCount}`,
      name: this.uniqueName(`Bot ${this.botCount}`),
      kind: "bot",
      level,
      connected: true,
      isHost: false,
    });
  }

  private nameOf(id: PlayerId): string {
    return this.seats.find((s) => s.id === id)?.name ?? "Someone";
  }

  /** Two "Guest 1234"s at one table would be confusing, so later ones get a suffix. */
  private uniqueName(name: string): string {
    const taken = new Set(this.seats.map((s) => s.name));
    if (!taken.has(name)) return name;
    for (let i = 2; ; i++) if (!taken.has(`${name} (${i})`)) return `${name} (${i})`;
  }
}
