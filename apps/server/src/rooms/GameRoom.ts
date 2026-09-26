import { botThinkingTimeMs, type BotLevel, type ThinkWeight } from "@cardhub/bots";
import {
  createRng,
  InvalidMoveError,
  playMove,
  startGame,
  type GameDefinition,
  type PlayerId,
} from "@cardhub/engine";
import {
  type CreateOptions,
  type JoinOptions,
  type OnlineSeat,
  type RoomPhase,
  type RoomSnapshot,
} from "@cardhub/shared";
import { Room, ServerError, type Client } from "@colyseus/core";
import { randomInt } from "node:crypto";
import { verifyPlayer, type VerifiedPlayer } from "../auth";
import { readConfig, type ServerConfig } from "../config";
import { claimRoomCode, releaseRoomCode } from "../roomCodes";
import { parseBotLevel } from "../validation";

const MAX_LOG = 60;
/** How long a dropped player keeps their seat before it is handed to a bot (or freed in the lobby). */
const RECONNECT_SECONDS = { lobby: 20, playing: 60 } as const;

/** Everything that differs between games; the room handles codes, seats, bots and reconnects. */
export interface OnlineGame<State, Move, View, Options> {
  definition: GameDefinition<State, Move, View, Options>;
  botLevels: readonly BotLevel[];
  /** Rebuilds a move from untrusted input, or `null` when it's malformed. */
  parseMove(payload: unknown): Move | null;
  /** The options a host may change from the lobby (anything else is ignored). */
  parseOptions(payload: unknown): Partial<Options>;
  pickBotAction(
    state: State,
    bots: Readonly<Record<PlayerId, BotLevel>>,
    seed: number,
  ): { player: PlayerId; move: Move } | null;
  describeMove(
    before: State,
    after: State,
    player: PlayerId,
    move: Move,
    nameOf: (id: PlayerId) => string,
  ): string[];
  /** How long a human would think about this move (drives bot pacing). */
  thinkWeight(state: State, move: Move): ThinkWeight;
}

/**
 * A room for any turn-based game: joinable only by code, host-controlled lobby, server-side rule
 * checks, per-player views (nobody receives another player's hidden cards), human-like bots, and
 * seats that survive disconnects.
 */
export abstract class GameRoom<State, Move, View, Options> extends Room {
  /** Overridable in tests. */
  static config: ServerConfig = readConfig();

  /**
   * Test hook for reproducible deals. Only server-side test code may set it: letting clients pick
   * the seed would let them predict the deck.
   */
  static seedForTests: (() => number) | null = null;

  protected abstract readonly game: OnlineGame<State, Move, View, Options>;

  private seats: OnlineSeat[] = [];
  /** The session currently holding each human seat (a rejoin replaces the old one). */
  private sessionOfSeat = new Map<PlayerId, string>();
  private options!: Options;
  private phase: RoomPhase = "lobby";
  // Not `state`: Colyseus syncs that field to every client, and this holds hidden cards.
  private gameState: State | null = null;
  private seed = 0;
  private moveCount = 0;
  private log: string[] = [];
  private botCount = 0;
  /** Multiplies bot pauses: 1 = human-like, 0 = instant (tests). */
  private botSpeed = 1;
  private botTimer: { clear(): void } | null = null;

  private get config(): ServerConfig {
    return (this.constructor as typeof GameRoom).config;
  }

  override onCreate(options: CreateOptions<Options> = {}) {
    const { definition } = this.game;
    this.maxClients = definition.maxPlayers;
    this.roomId = claimRoomCode();
    // Rooms are only joinable by code, never through public matchmaking.
    void this.setPrivate(true);
    this.options = { ...definition.defaultOptions, ...this.game.parseOptions(options.options) };
    if (options.botDelayMs === 0) this.botSpeed = 0;

    this.onMessage("move", (client, payload) =>
      this.guard(client, () => {
        const move = this.game.parseMove(payload);
        if (!move) throw new InvalidMoveError("malformed move");
        if (this.phase !== "playing" || !this.gameState)
          throw new InvalidMoveError("no game in progress");
        this.applyMove(this.seatOf(client).id, move);
      }),
    );
    this.onMessage("setOptions", (client, payload) =>
      this.guard(client, () => {
        this.requireHost(client, "lobby");
        this.options = { ...this.options, ...this.game.parseOptions(payload) };
      }),
    );
    this.onMessage("addBot", (client, payload) =>
      this.guard(client, () => {
        this.requireHost(client, "lobby");
        if (this.seats.length >= definition.maxPlayers)
          throw new InvalidMoveError("the table is full");
        this.addBot(parseBotLevel(payload, this.game.botLevels));
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
    const player = await verifyPlayer(this.config, options);
    const existing = this.seats.find((s) => s.id === player.id);
    if (!existing && this.phase !== "lobby")
      throw new ServerError(403, "That game has already started");
    if (!existing && this.seats.length >= this.game.definition.maxPlayers) {
      throw new ServerError(403, "That table is full");
    }
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
    const { definition } = this.game;
    if (this.seats.length < definition.minPlayers) {
      throw new InvalidMoveError(`add at least ${definition.minPlayers} players`);
    }
    this.seed = (this.constructor as typeof GameRoom).seedForTests?.() ?? randomInt(2 ** 32);
    this.gameState = startGame(definition, {
      players: this.seats.map((s) => s.id),
      options: this.options,
      seed: this.seed,
    });
    this.phase = "playing";
    this.moveCount = 0;
    this.log = [];
    this.scheduleBots();
  }

  private applyMove(player: PlayerId, move: Move) {
    const before = this.gameState!;
    const after = playMove(this.game.definition, before, player, move);
    const lines = this.game.describeMove(before, after, player, move, (id) => this.nameOf(id));
    this.log = [...this.log, ...lines].slice(-MAX_LOG);
    this.gameState = after;
    this.moveCount++;
    if (this.game.definition.result(after)) this.phase = "finished";
    this.scheduleBots();
  }

  /** Runs the next bot move after a human-like pause; any other move in the meantime reschedules it. */
  private scheduleBots() {
    this.botTimer?.clear();
    this.botTimer = null;
    if (this.phase !== "playing" || !this.gameState) return;
    const bots: Record<PlayerId, BotLevel> = Object.fromEntries(
      this.seats.filter((s) => s.kind === "bot").map((s) => [s.id, s.level]),
    );
    const seed = this.seed + Math.imul(this.moveCount + 1, 0x9e3779b1);
    const action = this.game.pickBotAction(this.gameState, bots, seed);
    if (!action) return;
    const delay = botThinkingTimeMs(
      this.game.thinkWeight(this.gameState, action.move),
      createRng(seed ^ 0x5bd1e995),
      this.botSpeed,
    );
    this.botTimer = this.clock.setTimeout(() => {
      this.botTimer = null;
      this.applyMove(action.player, action.move);
      this.sync();
    }, delay);
  }

  /** Sends every connected player their own snapshot (their hidden cards only). */
  private sync() {
    for (const client of this.clients) {
      const seat = this.heldSeat(client);
      if (seat) client.send("snapshot", this.snapshotFor(seat.id));
    }
  }

  private snapshotFor(player: PlayerId): RoomSnapshot<Options, View, Move> {
    const { definition } = this.game;
    const state = this.gameState;
    return {
      code: this.roomId,
      game: this.roomName,
      phase: this.phase,
      seats: this.seats.map((s) => ({ ...s })),
      you: player,
      options: { ...this.options },
      view: state ? definition.playerView(state, player) : null,
      legalMoves: state && this.phase === "playing" ? definition.legalMoves(state, player) : [],
      moveCount: this.moveCount,
      log: this.log,
      result: state ? definition.result(state) : null,
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
