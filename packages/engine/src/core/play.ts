import type { GameDefinition, PlayerId } from "./types";

export class InvalidMoveError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Invalid move: ${reason}`);
    this.name = "InvalidMoveError";
    this.reason = reason;
  }
}

export interface StartGameParams<Options> {
  players: readonly PlayerId[];
  options?: Partial<Options>;
  seed: number;
}

export function startGame<S, M, V, O>(
  game: GameDefinition<S, M, V, O>,
  { players, options, seed }: StartGameParams<O>,
): S {
  if (players.length < game.minPlayers || players.length > game.maxPlayers) {
    throw new RangeError(
      `${game.name} needs ${game.minPlayers}-${game.maxPlayers} players, got ${players.length}`,
    );
  }
  if (new Set(players).size !== players.length) {
    throw new Error("Player ids must be unique");
  }
  return game.setup({ players, options: { ...game.defaultOptions, ...options }, seed });
}

/** Validates then applies a move. Throws `InvalidMoveError` for illegal moves. */
export function playMove<S, M, V, O>(
  game: GameDefinition<S, M, V, O>,
  state: S,
  player: PlayerId,
  move: M,
): S {
  if (game.result(state)) {
    throw new InvalidMoveError("the game is over");
  }
  const validation = game.validateMove(state, player, move);
  if (!validation.ok) {
    throw new InvalidMoveError(validation.reason);
  }
  return game.applyMove(state, player, move);
}
