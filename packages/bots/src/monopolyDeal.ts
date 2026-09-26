import {
  COLOR_INFO,
  colorsOf,
  completeColors,
  createRng,
  DEAL_COLORS,
  deepClone,
  isValidPayment,
  monopolyDeal,
  payableCards,
  rentFor,
  setInfo,
  type DealCard,
  type DealColor,
  type MonopolyDealMove,
  type MonopolyDealState,
  type MonopolyDealView,
  type PendingAction,
  type PlayerId,
  type PlayerTable,
  type Rng,
} from "@cardhub/engine";
import type { BotLevel } from "./types";

type View = MonopolyDealView;

/** Score for completing enough sets to win; dwarfs every other consideration. */
const WIN = 10_000;

/** Stakes (see `Brain.stakes`) worth spending a Just Say No on. */
const JUST_SAY_NO_THRESHOLD = 20;

function tableOf(view: View, player: PlayerId): PlayerTable {
  return view.players.find((p) => p.id === player)!.table;
}

function worth(table: PlayerTable): number {
  return payableCards(table).reduce((sum, c) => sum + c.card.value, 0);
}

/**
 * How strong a collection is: complete sets of distinct colors count most, then partial sets
 * weighted by how close they are and how much rent they earn.
 */
function strength(table: PlayerTable, setsToWin: number): number {
  const distinct = completeColors(table).length;
  if (distinct >= setsToWin) return WIN;
  let score = distinct * 100;
  for (const color of DEAL_COLORS) {
    const { total, complete, rentCount } = setInfo(table, color);
    if (complete > 0 || total === 0) continue;
    const progress = rentCount / COLOR_INFO[color].setSize;
    score += progress * progress * 45 + rentFor(table, color);
  }
  return score;
}

function withCard(table: PlayerTable, card: DealCard, color: DealColor): PlayerTable {
  if (card.kind !== "property" && card.kind !== "wild") return table;
  return { ...table, properties: [...table.properties, { card, color }] };
}

function withoutCard(table: PlayerTable, cardId: string): PlayerTable {
  return {
    ...table,
    properties: table.properties.filter((p) => p.card.id !== cardId),
    bank: table.bank.filter((c) => c.id !== cardId),
    buildings: table.buildings.filter((b) => b.card.id !== cardId),
  };
}

function bestColor(card: DealCard, table: PlayerTable): DealColor {
  if (card.kind === "property") return card.color;
  if (card.kind !== "wild") return "brown";
  const progress = (c: DealColor) => setInfo(table, c).total / COLOR_INFO[c].setSize;
  return [...colorsOf(card)].sort((a, b) => progress(b) - progress(a))[0]!;
}

/** The normal bot's judgement, computed only from its own player view. */
class Brain {
  private readonly me: PlayerId;
  private readonly mine: PlayerTable;
  private readonly setsToWin: number;

  constructor(private readonly view: View) {
    this.me = view.me!;
    this.mine = tableOf(view, this.me);
    this.setsToWin = view.options.setsToWin;
  }

  private gain(after: PlayerTable, before: PlayerTable = this.mine): number {
    return strength(after, this.setsToWin) - strength(before, this.setsToWin);
  }

  private collectable(target: PlayerId, amount: number): number {
    return Math.min(amount, worth(tableOf(this.view, target)));
  }

  private findCard(cardId: string): DealCard | undefined {
    return (
      this.view.hand.find((c) => c.id === cardId) ??
      this.view.players
        .flatMap((p) => p.table.properties.map((t) => t.card))
        .find((c) => c.id === cardId)
    );
  }

  /** How much a card would help `table` if it went there (best color for wilds). */
  private valueTo(table: PlayerTable, card: DealCard): number {
    if (card.kind !== "property" && card.kind !== "wild") return 0;
    const colors = card.kind === "property" ? [card.color] : colorsOf(card);
    return Math.max(...colors.map((c) => this.gain(withCard(table, card, c), table)));
  }

  /** Quick value of a play; the bot ends its turn when nothing scores above zero. */
  score(move: MonopolyDealMove): number {
    const others = this.view.players.filter((p) => p.id !== this.me).map((p) => p.id);
    const card = "cardId" in move ? this.findCard(move.cardId) : undefined;

    switch (move.type) {
      case "moveWild": {
        const entry = this.mine.properties.find((p) => p.card.id === move.cardId)!;
        const moved = {
          ...this.mine,
          properties: this.mine.properties.map((p) =>
            p === entry ? { ...p, color: move.color } : p,
          ),
        };
        // Houses on the old set would be lost; only move when it clearly helps.
        const loses = this.mine.buildings.some((b) => b.color === entry.color) ? 20 : 0;
        return this.gain(moved) - loses - 1;
      }
      case "property":
        return 5 + this.gain(withCard(this.mine, card!, move.color));
      case "building":
        return card?.kind === "action" && card.action === "hotel" ? 10 : 9;
      case "bank": {
        // Deal Breakers are too valuable to spend as money.
        if (card?.kind === "action" && card.action === "dealBreaker") return -10;
        const isMoney = card?.kind === "money";
        const cushion = worth(this.mine) < 6 ? 2 : 1;
        return (card?.value ?? 0) * (isMoney ? cushion : 0.5) + (isMoney ? 1 : 0);
      }
      case "passGo":
        return 8 - Math.max(0, this.view.hand.length - 5) * 3;
      case "rent": {
        const doubles = move.doubles?.length ?? 0;
        const amount = rentFor(this.mine, move.color) * 2 ** doubles;
        const targets = move.target ? [move.target] : others;
        const collected = targets.reduce((sum, t) => sum + this.collectable(t, amount), 0);
        return collected * 2.2 - doubles * 4;
      }
      case "debtCollector":
        return this.collectable(move.target, 5) * 2.2;
      case "birthday":
        return others.reduce((sum, t) => sum + this.collectable(t, 2), 0) * 2.2;
      case "slyDeal": {
        const target = this.findCard(move.targetCardId)!;
        return 4 + this.valueTo(this.mine, target) + target.value * 0.5;
      }
      case "forcedDeal": {
        const target = this.findCard(move.targetCardId)!;
        const after = withCard(
          withoutCard(this.mine, move.offeredCardId),
          target,
          bestColor(target, this.mine),
        );
        return this.gain(after) - 2;
      }
      case "dealBreaker": {
        const theirs = tableOf(this.view, move.target);
        const taken = theirs.properties
          .filter((p) => p.color === move.color)
          .slice(0, COLOR_INFO[move.color].setSize);
        const after = { ...this.mine, properties: [...this.mine.properties, ...taken] };
        return 40 + this.gain(after) + rentFor(theirs, move.color);
      }
      default:
        return 0;
    }
  }

  /** How much the pending action matters: what the target loses (or the actor gains). */
  private stakes(p: PendingAction): number {
    const victim = tableOf(this.view, p.targets[0]!);
    switch (p.kind) {
      case "dealBreaker":
        return 100;
      case "slyDeal":
      case "forcedDeal":
        return 10 - this.gain(withoutCard(victim, p.targetCardId!), victim);
      default:
        return Math.min(p.amount, worth(victim)) * 3;
    }
  }

  /** Saves Just Say No for real threats (or, as the actor, to protect a big payoff). */
  respond(legal: MonopolyDealMove[]): MonopolyDealMove {
    const jsn = legal.find((m) => m.type === "justSayNo");
    if (!jsn) return { type: "accept" };
    return this.stakes(this.view.pending!) >= JUST_SAY_NO_THRESHOLD ? jsn : { type: "accept" };
  }

  /** Pays with the cards it would miss least: spare money first, then loose properties. */
  pay(amount: number, legal: MonopolyDealMove[]): MonopolyDealMove {
    const cost = (cardIds: readonly string[]) => {
      const after = cardIds.reduce((t, id) => withoutCard(t, id), this.mine);
      const money = this.mine.bank
        .filter((c) => cardIds.includes(c.id))
        .reduce((s, c) => s + c.value, 0);
      return money + Math.max(0, -this.gain(after));
    };

    // Our own candidate too: cards ordered by how little we'd miss them per M.
    const payable = payableCards(this.mine);
    const ordered = [...payable].sort(
      (a, b) => cost([a.card.id]) / a.card.value - cost([b.card.id]) / b.card.value,
    );
    const picked: string[] = [];
    let paid = 0;
    for (const c of ordered) {
      if (paid >= amount) break;
      picked.push(c.card.id);
      paid += c.card.value;
    }
    for (const id of [...picked].sort((a, b) => cost([b]) - cost([a]))) {
      const value = payable.find((c) => c.card.id === id)!.card.value;
      if (paid - value >= amount) {
        picked.splice(picked.indexOf(id), 1);
        paid -= value;
      }
    }
    const options = legal.filter((m): m is MonopolyDealMove & { type: "pay" } => m.type === "pay");
    if (isValidPayment(this.mine, amount, picked)) options.push({ type: "pay", cardIds: picked });
    return options.sort((a, b) => cost(a.cardIds) - cost(b.cardIds))[0] ?? legal[0]!;
  }

  /** Keeps properties and strong actions; throws away what it can best spare. */
  discard(): MonopolyDealMove {
    const excess = this.view.hand.length - this.view.options.handLimit;
    const keep = (c: DealCard): number => {
      switch (c.kind) {
        case "property":
        case "wild":
          return 20 + this.valueTo(this.mine, c);
        case "money":
          return c.value * 2;
        case "rent":
          return colorsOf(c).some((color) => rentFor(this.mine, color) > 0) ? 10 : 3;
        case "action":
          return (
            {
              justSayNo: 30,
              dealBreaker: 40,
              slyDeal: 16,
              forcedDeal: 14,
              debtCollector: 12,
              birthday: 9,
              doubleRent: 6,
              house: 5,
              hotel: 5,
              passGo: 4,
            } as const
          )[c.action];
      }
    };
    const ranked = [...this.view.hand].sort((a, b) => keep(a) - keep(b));
    return { type: "discard", cardIds: ranked.slice(0, excess).map((c) => c.id) };
  }
}

function chooseEasy(view: View, legal: MonopolyDealMove[], rng: Rng): MonopolyDealMove {
  if (view.pending?.paying || view.phase === "discard") return legal[0]!;
  const jsn = legal.find((m) => m.type === "justSayNo");
  if (view.pending) return jsn && rng.next() < 0.4 ? jsn : { type: "accept" };
  const plays = legal.filter((m) => m.type !== "endTurn" && m.type !== "moveWild");
  if (plays.length > 0 && rng.next() < 0.8) return plays[rng.int(plays.length)]!;
  return legal.find((m) => m.type === "endTurn") ?? legal[rng.int(legal.length)]!;
}

function chooseNormal(view: View, legal: MonopolyDealMove[], rng: Rng): MonopolyDealMove {
  const brain = new Brain(view);
  const pending = view.pending;
  if (pending?.paying) return brain.pay(pending.amount, legal);
  if (pending) return brain.respond(legal);
  if (view.phase === "discard") return brain.discard();

  let best = legal.find((m) => m.type === "endTurn") ?? legal[0]!;
  let bestScore = 0;
  for (const move of legal) {
    // A little noise so equal choices vary from game to game, like a person's would.
    const score = brain.score(move) + rng.next() * 0.1;
    if (score > bestScore) {
      best = move;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Picks a move from `legalMoves` using only what the bot's player view shows (never other hands
 * or the draw pile). For payments and discards it may build its own valid choice.
 */
export function chooseMonopolyDealMove(
  view: View,
  legalMoves: MonopolyDealMove[],
  level: BotLevel,
  rng: Rng,
): MonopolyDealMove {
  if (legalMoves.length === 0) throw new Error("Bot has no legal moves");
  return level === "easy" ? chooseEasy(view, legalMoves, rng) : chooseNormal(view, legalMoves, rng);
}

/** The next move a bot wants to make, or `null` when a human must act. */
export function pickMonopolyDealBotAction(
  state: MonopolyDealState,
  bots: Readonly<Record<PlayerId, BotLevel>>,
  seed: number,
): { player: PlayerId; move: MonopolyDealMove } | null {
  const [player] = monopolyDeal.activePlayers(state);
  const level = player ? bots[player] : undefined;
  if (!player || !level) return null;
  const view = monopolyDeal.playerView(state, player);
  const move = chooseMonopolyDealMove(
    view,
    monopolyDeal.legalMoves(state, player),
    level,
    createRng(seed >>> 0),
  );
  return { player, move: deepClone(move) };
}
