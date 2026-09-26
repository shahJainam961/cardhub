import {
  type DealCard,
  type MonopolyDealMove,
  type MonopolyDealState,
  type PlayerId,
} from "@cardhub/engine";
import { COLOR_NAMES, dealCardLabel } from "./labels";

/** Every card on a table, mapped to its owner (bank, properties and buildings). */
function tableCards(s: MonopolyDealState): Map<string, { owner: PlayerId; card: DealCard }> {
  const owners = new Map<string, { owner: PlayerId; card: DealCard }>();
  for (const owner of s.players) {
    const t = s.tables[owner]!;
    for (const card of [
      ...t.bank,
      ...t.properties.map((p) => p.card),
      ...t.buildings.map((b) => b.card),
    ]) {
      owners.set(card.id, { owner, card });
    }
  }
  return owners;
}

function findCard(s: MonopolyDealState, cardId: string): DealCard | undefined {
  for (const p of s.players) {
    const found =
      s.hands[p]!.find((c) => c.id === cardId) ??
      s.tables[p]!.properties.find((t) => t.card.id === cardId)?.card;
    if (found) return found;
  }
  return undefined;
}

function primaryLine(
  before: MonopolyDealState,
  after: MonopolyDealState,
  player: PlayerId,
  move: MonopolyDealMove,
  nameOf: (player: PlayerId) => string,
): string | null {
  const name = nameOf(player);
  const card = "cardId" in move ? findCard(before, move.cardId) : undefined;
  const label = card ? dealCardLabel(card) : "a card";
  const ownerName = (cardId: string) => {
    const owner = before.players.find((p) =>
      before.tables[p]!.properties.some((t) => t.card.id === cardId),
    );
    return owner ? nameOf(owner) : "someone";
  };

  switch (move.type) {
    case "bank":
      return `${name} banked ${label}${card?.kind === "money" ? "" : ` (${card?.value ?? 0}M)`}`;
    case "property":
      return card?.kind === "wild"
        ? `${name} played a ${label} as ${COLOR_NAMES[move.color]}`
        : `${name} played ${label}`;
    case "moveWild":
      return `${name} moved a wild to ${COLOR_NAMES[move.color]}`;
    case "passGo":
      return `${name} played Pass Go and drew 2 cards`;
    case "rent": {
      const amount = after.pending?.amount ?? before.pending?.amount;
      const doubled = move.doubles?.length
        ? ` (doubled${move.doubles.length > 1 ? " twice" : ""})`
        : "";
      const who = move.target ? nameOf(move.target) : "everyone";
      return `${name} charged ${COLOR_NAMES[move.color]} rent${amount ? ` of ${amount}M` : ""} to ${who}${doubled}`;
    }
    case "debtCollector":
      return `${name} used Debt Collector on ${nameOf(move.target)} (5M)`;
    case "birthday":
      return `It's ${name}'s birthday! Everyone pays 2M`;
    case "slyDeal":
      return `${name} used Sly Deal on ${ownerName(move.targetCardId)}'s ${dealCardLabel(findCard(before, move.targetCardId)!)}`;
    case "forcedDeal":
      return `${name} used Forced Deal: their ${dealCardLabel(findCard(before, move.offeredCardId)!)} for ${ownerName(move.targetCardId)}'s ${dealCardLabel(findCard(before, move.targetCardId)!)}`;
    case "dealBreaker":
      return `${name} used Deal Breaker on ${nameOf(move.target)}'s ${COLOR_NAMES[move.color]} set`;
    case "building":
      return `${name} built a ${label.toLowerCase()} on ${COLOR_NAMES[move.color]}`;
    case "endTurn":
      return after.phase === "discard" ? null : `${name} ended the turn`;
    case "discard":
      return `${name} discarded ${move.cardIds.length} card${move.cardIds.length === 1 ? "" : "s"}`;
    case "justSayNo":
      return `${name} said Just Say No!`;
    case "accept":
      return (before.pending?.justSayNos ?? 0) % 2 === 1
        ? `${name} accepted the Just Say No`
        : null;
    case "pay":
      return null;
  }
}

/**
 * Log lines for one move: what the player did, then every card that changed hands as a result
 * (including automatic payments and steals), e.g. "Sam gave Bot 1: 3M, Boardwalk".
 */
export function describeMonopolyDealMove(
  before: MonopolyDealState,
  after: MonopolyDealState,
  player: PlayerId,
  move: MonopolyDealMove,
  nameOf: (player: PlayerId) => string,
): string[] {
  const lines: string[] = [];
  const primary = primaryLine(before, after, player, move, nameOf);
  if (primary) lines.push(primary);

  const was = tableCards(before);
  const transfers = new Map<string, DealCard[]>();
  for (const [id, { owner, card }] of tableCards(after)) {
    const from = was.get(id)?.owner;
    if (!from || from === owner) continue;
    const key = `${from}\u0000${owner}`;
    transfers.set(key, [...(transfers.get(key) ?? []), card]);
  }
  for (const [key, cards] of transfers) {
    const [from, to] = key.split("\u0000") as [PlayerId, PlayerId];
    lines.push(`${nameOf(from)} gave ${nameOf(to)}: ${cards.map(dealCardLabel).join(", ")}`);
  }
  if (!before.winner && after.winner)
    lines.push(`${nameOf(after.winner)} completed 3 sets and wins!`);
  return lines;
}
