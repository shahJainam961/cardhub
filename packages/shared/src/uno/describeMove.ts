import type { PlayerId, UnoMove, UnoState } from "@cardhub/engine";
import { cardLabel } from "./cardLabel";

/** One line for the game log, e.g. "Sam played Red 7" or "Bot 1 drew 4 cards". */
export function describeUnoMove(
  before: UnoState,
  after: UnoState,
  player: PlayerId,
  move: UnoMove,
  nameOf: (player: PlayerId) => string,
): string {
  const name = nameOf(player);
  const handBefore = before.hands[player]!.length;

  switch (move.type) {
    case "pass":
      return `${name} passed`;
    case "draw": {
      const drawn = after.hands[player]!.length - handBefore;
      return drawn === 1 ? `${name} drew a card` : `${name} drew ${drawn} cards`;
    }
    case "play": {
      const card = before.hands[player]!.find((c) => c.id === move.cardId)!;
      const jumpedIn = player !== before.players[before.currentIndex];
      let text = `${name} ${jumpedIn ? "jumped in with" : "played"} ${cardLabel(card)}`;
      if (move.color) text += ` and chose ${move.color}`;
      if (move.target) text += ` and swapped hands with ${nameOf(move.target)}`;
      const handMoves =
        before.options.sevenZero &&
        card.kind === "number" &&
        (card.value === 7 || card.value === 0);
      if (handBefore === 2 && !move.uno && !handMoves) {
        text += `, but forgot to call UNO (+${before.options.unoPenalty})`;
      }
      return text;
    }
  }
}
