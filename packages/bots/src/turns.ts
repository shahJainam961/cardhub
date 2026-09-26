import { createRng, uno, type PlayerId, type UnoMove, type UnoState } from "@cardhub/engine";
import type { BotLevel } from "./types";
import { chooseUnoMove, unoBotWantsToJumpIn } from "./uno";

/**
 * The next move any bot wants to make, or `null` when it is a human's turn. Bots holding an
 * identical card may jump in first. `seed` should change with every move (e.g. seed + move count)
 * so bot choices are reproducible but not repetitive.
 */
export function pickUnoBotAction(
  state: UnoState,
  bots: Readonly<Record<PlayerId, BotLevel>>,
  seed: number,
): { player: PlayerId; move: UnoMove } | null {
  if (uno.result(state)) return null;
  const rng = createRng(seed >>> 0);
  const decide = (player: PlayerId, level: BotLevel) => ({
    player,
    move: chooseUnoMove(uno.playerView(state, player), uno.legalMoves(state, player), level, rng),
  });

  const current = state.players[state.currentIndex]!;
  for (const player of uno.activePlayers(state)) {
    const level = bots[player];
    if (player !== current && level && unoBotWantsToJumpIn(level, rng))
      return decide(player, level);
  }
  const level = bots[current];
  return level ? decide(current, level) : null;
}
