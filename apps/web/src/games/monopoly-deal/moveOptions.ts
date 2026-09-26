import {
  rentFor,
  type DealCard,
  type MonopolyDealMove,
  type MonopolyDealView,
  type PlayerId,
} from "@cardhub/engine";
import { COLOR_NAMES, dealCardLabel } from "@cardhub/shared";

export type NameOf = (player: PlayerId) => string;

/** Every card visible to this player, by id (hand and all tables). */
export function visibleCards(view: MonopolyDealView): Map<string, DealCard> {
  const cards = new Map<string, DealCard>();
  for (const c of view.hand) cards.set(c.id, c);
  for (const p of view.players) {
    for (const c of p.table.bank) cards.set(c.id, c);
    for (const t of p.table.properties) cards.set(t.card.id, t.card);
    for (const b of p.table.buildings) cards.set(b.card.id, b.card);
  }
  return cards;
}

export function ownerOfProperty(view: MonopolyDealView, cardId: string): PlayerId | undefined {
  return view.players.find((p) => p.table.properties.some((t) => t.card.id === cardId))?.id;
}

/** The hand card a move is played with (Double The Rent cards travel with a rent card). */
export function handCardOf(move: MonopolyDealMove): string | null {
  return "cardId" in move && move.type !== "justSayNo" ? move.cardId : null;
}

/** A button label for one legal move, e.g. "Charge Red rent: 6M from everyone". */
export function optionLabel(
  view: MonopolyDealView,
  move: MonopolyDealMove,
  nameOf: NameOf,
): string {
  const cards = visibleCards(view);
  const label = (id: string) => dealCardLabel(cards.get(id)!);
  const me = view.players.find((p) => p.id === view.me)!.table;

  switch (move.type) {
    case "bank":
      return `Put in bank (${cards.get(move.cardId)?.value ?? 0}M)`;
    case "property":
      return `Play as ${COLOR_NAMES[move.color]} property`;
    case "moveWild":
      return `Move to ${COLOR_NAMES[move.color]}`;
    case "passGo":
      return "Play: draw 2 cards";
    case "birthday":
      return "Play: everyone pays you 2M";
    case "debtCollector":
      return `Charge ${nameOf(move.target)} 5M`;
    case "rent": {
      const doubles = move.doubles?.length ?? 0;
      const amount = rentFor(me, move.color) * 2 ** doubles;
      const who = move.target ? nameOf(move.target) : "everyone";
      const extra = doubles ? ` with ${doubles} Double The Rent` : "";
      return `Charge ${COLOR_NAMES[move.color]} rent: ${amount}M from ${who}${extra}`;
    }
    case "slyDeal":
      return `Take ${label(move.targetCardId)} from ${nameOf(ownerOfProperty(view, move.targetCardId)!)}`;
    case "forcedDeal":
      return `Give your ${label(move.offeredCardId)}`;
    case "dealBreaker":
      return `Take ${nameOf(move.target)}'s ${COLOR_NAMES[move.color]} set`;
    case "building":
      return `Build on ${COLOR_NAMES[move.color]}`;
    default:
      return move.type;
  }
}
