import { completeColors, type MonopolyDealView, type PlayerId } from "@cardhub/engine";
import { useEffect, useRef } from "react";
import { play } from "../../audio/sound";
import { celebrate, sparkle } from "../../lib/confetti";

const bankOf = (v: MonopolyDealView, id: PlayerId) =>
  v.players.find((p) => p.id === id)?.table.bank.reduce((sum, c) => sum + c.value, 0) ?? 0;
const propertiesOf = (v: MonopolyDealView, id: PlayerId) =>
  v.players.find((p) => p.id === id)?.table.properties.length ?? 0;
const setsOf = (v: MonopolyDealView, id: PlayerId) => {
  const table = v.players.find((p) => p.id === id)?.table;
  return table ? completeColors(table).length : 0;
};

/**
 * Sound and celebration for what just happened, found by comparing each new view with the last:
 * money in, a property taken, a set completed, a Just Say No, your turn, the end of the game.
 */
export function useDealEffects(view: MonopolyDealView): void {
  const previous = useRef<MonopolyDealView | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (!before) return;
    const me = view.me;

    if (before.topDiscard?.id !== view.topDiscard?.id) play("flick");
    if ((view.pending?.justSayNos ?? 0) > (before.pending?.justSayNos ?? 0)) play("nope");

    if (me) {
      if (bankOf(view, me) > bankOf(before, me)) play("chaChing");
      // During someone else's turn my properties only shrink by paying with them or being robbed.
      if (view.currentPlayer !== me && propertiesOf(view, me) < propertiesOf(before, me))
        play("steal");
    }

    for (const p of view.players) {
      if (setsOf(view, p.id) > setsOf(before, p.id)) {
        play("setComplete");
        sparkle(0.5, p.id === me ? 0.7 : 0.3);
      }
    }

    if (!before.winner && view.winner) {
      if (!me || view.winner === me) {
        play("win");
        celebrate();
      } else {
        play("lose");
      }
    } else if (me && view.awaiting === me && before.awaiting !== me) {
      play("turn");
    }
  }, [view]);
}
