import type { PlayerId, UnoView } from "@cardhub/engine";
import { useEffect, useRef } from "react";
import { play } from "../../audio/sound";
import { celebrate, sparkle } from "../../lib/confetti";

/**
 * Sound and celebration for what just happened, worked out by comparing each new view with the
 * previous one: a card hitting the pile, drawing, someone down to one card, your turn, the end.
 */
export function useUnoEffects(view: UnoView): void {
  const previous = useRef<UnoView | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (!before) return;
    const me = view.me;

    if (before.topCard.id !== view.topCard.id) play("flick");
    if (me && before.me === me && view.hand.length > before.hand.length) play("draw");

    const count = (v: UnoView, id: PlayerId) => v.players.find((p) => p.id === id)?.cardCount ?? 0;
    if (view.players.some((p) => p.cardCount === 1 && count(before, p.id) > 1)) {
      play("uno");
      sparkle(0.5, 0.25);
    }

    if (!before.winner && view.winner) {
      if (!me || view.winner === me) {
        play("win");
        celebrate();
      } else {
        play("lose");
      }
    } else if (me && view.currentPlayer === me && before.currentPlayer !== me) {
      play("turn");
    }
  }, [view]);
}
