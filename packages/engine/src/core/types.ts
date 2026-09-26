export type PlayerId = string;

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export interface GameResult {
  outcome: "win" | "draw";
  winners: PlayerId[];
  /** Optional per-player points, e.g. for leaderboards and gamification. */
  scores?: Record<PlayerId, number>;
}

export interface SetupContext<Options> {
  players: readonly PlayerId[];
  options: Options;
  seed: number;
}

/**
 * The contract every game implements. All functions are pure: they never mutate
 * the state they receive, so the same code can run on the device, in bots and on
 * the server, and any game can be replayed from its seed and move list.
 */
export interface GameDefinition<State, Move, View, Options> {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  defaultOptions: Options;

  setup(ctx: SetupContext<Options>): State;

  /** Players who may make a move right now (usually one, more for e.g. Uno jump-in). */
  activePlayers(state: State): PlayerId[];

  /** Every move `player` may make right now. Used by bots and to highlight moves in the UI. */
  legalMoves(state: State, player: PlayerId): Move[];

  validateMove(state: State, player: PlayerId, move: Move): ValidationResult;

  /** Only call with a move that passed `validateMove` (use `playMove` to enforce that). */
  applyMove(state: State, player: PlayerId, move: Move): State;

  /** What `player` is allowed to see; `null` is a spectator. Never leaks hidden information. */
  playerView(state: State, player: PlayerId | null): View;

  /** `null` while the game is still in progress. */
  result(state: State): GameResult | null;
}
