import { deepClone } from "../../core/clone";
import { createRng, type Rng } from "../../core/rng";
import type { GameDefinition, PlayerId, ValidationResult } from "../../core/types";
import {
  BIRTHDAY_AMOUNT,
  COLOR_INFO,
  colorsOf,
  createDealDeck,
  DEAL_COLORS,
  DEBT_COLLECTOR_AMOUNT,
  isAction,
  isPlaceable,
  type ActionKind,
  type DealCard,
  type DealColor,
} from "./cards";
import {
  buildingsOn,
  canTakeProperty,
  completeColors,
  isValidPayment,
  payableCards,
  removeInvalidBuildings,
  rentFor,
  setInfo,
  suggestPayments,
  takeCompleteSet,
  type PlayerTable,
} from "./table";

export interface MonopolyDealOptions {
  handSize: number;
  playsPerTurn: number;
  handLimit: number;
  setsToWin: number;
}

export const DEFAULT_MONOPOLY_DEAL_OPTIONS: MonopolyDealOptions = {
  handSize: 5,
  playsPerTurn: 3,
  handLimit: 7,
  setsToWin: 3,
};

export type TargetedAction =
  "rent" | "debtCollector" | "birthday" | "slyDeal" | "forcedDeal" | "dealBreaker";

/** An action waiting on other players: Just Say No responses, then payment or the steal itself. */
export interface PendingAction {
  kind: TargetedAction;
  actor: PlayerId;
  /** Players still to be dealt with, in turn order; the first is being handled now. */
  targets: PlayerId[];
  /** Debt each target owes (0 for steals). */
  amount: number;
  /** Rent color, or the set a Deal Breaker takes. */
  color?: DealColor;
  /** Sly Deal / Forced Deal: the card being taken. */
  targetCardId?: string;
  /** Forced Deal: the actor's card given in exchange. */
  offeredCardId?: string;
  /** Just Say No cards played so far against the current target's part of the action. */
  justSayNos: number;
  /** The current target has accepted and must now choose how to pay. */
  paying: boolean;
}

export interface MonopolyDealState {
  options: MonopolyDealOptions;
  players: PlayerId[];
  hands: Record<PlayerId, DealCard[]>;
  tables: Record<PlayerId, PlayerTable>;
  /** Cards are drawn from the end. */
  drawPile: DealCard[];
  discardPile: DealCard[];
  currentIndex: number;
  playsLeft: number;
  /** "discard": the current player ended their turn over the hand limit. */
  phase: "play" | "discard";
  pending: PendingAction | null;
  winner: PlayerId | null;
  /** Nothing left to draw or play anywhere: the game ends without a winner. */
  stalemate: boolean;
  rngState: number;
}

export type MonopolyDealMove =
  | { type: "bank"; cardId: string }
  | { type: "property"; cardId: string; color: DealColor }
  /** Re-color a wild already on your table. Free, any time during your turn. */
  | { type: "moveWild"; cardId: string; color: DealColor }
  | { type: "passGo"; cardId: string }
  /** `target` only for the any-color rent; `doubles` are Double The Rent cards played with it. */
  | { type: "rent"; cardId: string; color: DealColor; target?: PlayerId; doubles?: string[] }
  | { type: "debtCollector"; cardId: string; target: PlayerId }
  | { type: "birthday"; cardId: string }
  | { type: "slyDeal"; cardId: string; targetCardId: string }
  | { type: "forcedDeal"; cardId: string; offeredCardId: string; targetCardId: string }
  | { type: "dealBreaker"; cardId: string; target: PlayerId; color: DealColor }
  | { type: "building"; cardId: string; color: DealColor }
  | { type: "endTurn" }
  | { type: "discard"; cardIds: string[] }
  | { type: "justSayNo"; cardId: string }
  /** Decline to (counter-)Just Say No and let the action go ahead as it stands. */
  | { type: "accept" }
  | { type: "pay"; cardIds: string[] };

export interface MonopolyDealView {
  me: PlayerId | null;
  hand: DealCard[];
  players: { id: PlayerId; handCount: number; table: PlayerTable }[];
  drawPileCount: number;
  topDiscard: DealCard | null;
  currentPlayer: PlayerId;
  phase: MonopolyDealState["phase"];
  playsLeft: number;
  pending: PendingAction | null;
  /** Who must act right now (the current player, or someone responding to an action). */
  awaiting: PlayerId | null;
  winner: PlayerId | null;
  stalemate: boolean;
  options: MonopolyDealOptions;
}

const OK: ValidationResult = { ok: true };
const fail = (reason: string): ValidationResult => ({ ok: false, reason });

/** Actions played straight from the hand onto the discard pile, and their move types. */
const PLAYED_ACTIONS: Partial<Record<MonopolyDealMove["type"], ActionKind>> = {
  passGo: "passGo",
  debtCollector: "debtCollector",
  birthday: "birthday",
  slyDeal: "slyDeal",
  forcedDeal: "forcedDeal",
  dealBreaker: "dealBreaker",
};

function handOf(s: MonopolyDealState, player: PlayerId): DealCard[] {
  const hand = s.hands[player];
  if (!hand) throw new Error(`Unknown player ${player}`);
  return hand;
}

function tableOf(s: MonopolyDealState, player: PlayerId): PlayerTable {
  const table = s.tables[player];
  if (!table) throw new Error(`Unknown player ${player}`);
  return table;
}

function currentPlayer(s: MonopolyDealState): PlayerId {
  return s.players[s.currentIndex]!;
}

function isOver(s: MonopolyDealState): boolean {
  return s.winner !== null || s.stalemate;
}

/** Who must act now, or null when the game is over. */
function awaiting(s: MonopolyDealState): PlayerId | null {
  if (isOver(s)) return null;
  const p = s.pending;
  if (!p || p.targets.length === 0) return currentPlayer(s);
  if (p.paying) return p.targets[0]!;
  return p.justSayNos % 2 === 0 ? p.targets[0]! : p.actor;
}

function findInHand(s: MonopolyDealState, player: PlayerId, cardId: string): DealCard | undefined {
  return handOf(s, player).find((c) => c.id === cardId);
}

function takeFromHand(s: MonopolyDealState, player: PlayerId, cardId: string): DealCard {
  const hand = handOf(s, player);
  return hand.splice(
    hand.findIndex((c) => c.id === cardId),
    1,
  )[0]!;
}

function ownerOf(s: MonopolyDealState, cardId: string): PlayerId | undefined {
  return s.players.find((p) => tableOf(s, p).properties.some((t) => t.card.id === cardId));
}

function draw(s: MonopolyDealState, rng: Rng, player: PlayerId, count: number): void {
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0) {
      s.drawPile = rng.shuffle(s.discardPile);
      s.discardPile = [];
    }
    const card = s.drawPile.pop();
    if (!card) return;
    handOf(s, player).push(card);
  }
}

function startTurn(s: MonopolyDealState, rng: Rng, index: number): void {
  s.currentIndex = index;
  s.playsLeft = s.options.playsPerTurn;
  s.phase = "play";
  const player = currentPlayer(s);
  draw(s, rng, player, handOf(s, player).length === 0 ? 5 : 2);
  const nothingLeft =
    s.drawPile.length === 0 &&
    s.discardPile.length === 0 &&
    s.players.every((p) => handOf(s, p).length === 0);
  if (nothingLeft) s.stalemate = true;
}

function nextTurn(s: MonopolyDealState, rng: Rng): void {
  startTurn(s, rng, (s.currentIndex + 1) % s.players.length);
}

function checkWinner(s: MonopolyDealState): void {
  if (s.winner) return;
  // The current player is checked first, in case one move completes sets for two players.
  const order = s.players.map((_, i) => s.players[(s.currentIndex + i) % s.players.length]!);
  s.winner = order.find((p) => completeColors(tableOf(s, p)).length >= s.options.setsToWin) ?? null;
}

function nextTarget(p: PendingAction): void {
  p.targets.shift();
  p.justSayNos = 0;
  p.paying = false;
}

function hasJustSayNo(s: MonopolyDealState, player: PlayerId): boolean {
  return handOf(s, player).some((c) => isAction(c, "justSayNo"));
}

/** Whether `player` may play a Just Say No right now (on your own turn it uses up a play). */
function canJustSayNo(s: MonopolyDealState, player: PlayerId): boolean {
  return hasJustSayNo(s, player) && (player !== currentPlayer(s) || s.playsLeft > 0);
}

function transferPayment(
  s: MonopolyDealState,
  from: PlayerId,
  to: PlayerId,
  cardIds: readonly string[],
): void {
  const payer = tableOf(s, from);
  const receiver = tableOf(s, to);
  for (const id of cardIds) {
    const inBank = payer.bank.findIndex((c) => c.id === id);
    if (inBank >= 0) {
      receiver.bank.push(payer.bank.splice(inBank, 1)[0]!);
      continue;
    }
    const building = payer.buildings.findIndex((b) => b.card.id === id);
    if (building >= 0) {
      // Houses and hotels paid over go into the receiver's bank as money.
      receiver.bank.push(payer.buildings.splice(building, 1)[0]!.card);
      continue;
    }
    const property = payer.properties.findIndex((p) => p.card.id === id);
    if (property >= 0) receiver.properties.push(payer.properties.splice(property, 1)[0]!);
  }
  removeInvalidBuildings(payer, s.discardPile);
}

function applySteal(s: MonopolyDealState, p: PendingAction, target: PlayerId): void {
  const mine = tableOf(s, p.actor);
  const theirs = tableOf(s, target);
  const take = (from: PlayerTable, to: PlayerTable, cardId: string) => {
    const index = from.properties.findIndex((t) => t.card.id === cardId);
    if (index >= 0) to.properties.push(from.properties.splice(index, 1)[0]!);
  };
  if (p.kind === "slyDeal") {
    take(theirs, mine, p.targetCardId!);
  } else if (p.kind === "forcedDeal") {
    take(theirs, mine, p.targetCardId!);
    take(mine, theirs, p.offeredCardId!);
  } else if (p.kind === "dealBreaker" && setInfo(theirs, p.color!).complete > 0) {
    const set = takeCompleteSet(theirs, p.color!);
    mine.properties.push(...set.properties);
    mine.buildings.push(...set.buildings);
  }
  removeInvalidBuildings(mine, s.discardPile);
  removeInvalidBuildings(theirs, s.discardPile);
}

/** The player whose turn it is to answer declines to Just Say No (again). */
function acceptCurrent(s: MonopolyDealState, p: PendingAction): void {
  const target = p.targets[0]!;
  if (p.justSayNos % 2 === 1) {
    // The target's Just Say No stands: they're excused.
    nextTarget(p);
  } else if (p.amount > 0) {
    p.paying = true;
  } else {
    applySteal(s, p, target);
    nextTarget(p);
  }
}

/**
 * Resolves everything that needs no decision: players without a Just Say No can't object, and a
 * player whose table is worth no more than the debt must hand it all over.
 */
function settle(s: MonopolyDealState): void {
  for (;;) {
    checkWinner(s);
    const p = s.pending;
    if (isOver(s) || !p) return;
    if (p.targets.length === 0) {
      s.pending = null;
      return;
    }
    const target = p.targets[0]!;
    if (p.paying) {
      const payable = payableCards(tableOf(s, target));
      const worth = payable.reduce((sum, c) => sum + c.card.value, 0);
      if (worth > p.amount) return;
      transferPayment(
        s,
        target,
        p.actor,
        payable.map((c) => c.card.id),
      );
      nextTarget(p);
      continue;
    }
    const responder = p.justSayNos % 2 === 0 ? target : p.actor;
    if (canJustSayNo(s, responder)) return;
    acceptCurrent(s, p);
  }
}

function validatePlay(s: MonopolyDealState, player: PlayerId, cost = 1): ValidationResult {
  if (player !== currentPlayer(s)) return fail("it is not your turn");
  if (s.pending) return fail("wait for the current action to finish");
  if (s.phase !== "play") return fail("discard down to the hand limit first");
  if (s.playsLeft < cost) return fail("you have no plays left this turn");
  return OK;
}

function validateMove(
  s: MonopolyDealState,
  player: PlayerId,
  move: MonopolyDealMove,
): ValidationResult {
  if (isOver(s)) return fail("the game is over");
  if (!s.players.includes(player)) return fail("you are not in this game");
  const others = s.players.filter((p) => p !== player);

  switch (move.type) {
    case "justSayNo": {
      const p = s.pending;
      if (!p || p.paying || p.targets.length === 0) return fail("there is nothing to say no to");
      if (awaiting(s) !== player) return fail("it is not your turn to respond");
      const card = findInHand(s, player, move.cardId);
      if (!card || !isAction(card, "justSayNo"))
        return fail("that is not a Just Say No card in your hand");
      if (!canJustSayNo(s, player)) return fail("you have no plays left this turn");
      return OK;
    }
    case "accept": {
      const p = s.pending;
      if (!p || p.paying || p.targets.length === 0) return fail("there is nothing to accept");
      if (awaiting(s) !== player) return fail("it is not your turn to respond");
      return OK;
    }
    case "pay": {
      const p = s.pending;
      if (!p?.paying || awaiting(s) !== player) return fail("you don't owe anything right now");
      if (!isValidPayment(tableOf(s, player), p.amount, move.cardIds)) {
        return fail("pay at least what you owe with cards from your table, without extra cards");
      }
      return OK;
    }
    case "discard": {
      if (player !== currentPlayer(s) || s.phase !== "discard")
        return fail("you don't need to discard");
      const excess = handOf(s, player).length - s.options.handLimit;
      const ids = new Set(move.cardIds);
      if (ids.size !== move.cardIds.length || ids.size !== excess) {
        return fail(`discard exactly ${excess} card${excess === 1 ? "" : "s"}`);
      }
      if (move.cardIds.some((id) => !findInHand(s, player, id)))
        return fail("that card is not in your hand");
      return OK;
    }
    case "endTurn":
      return validatePlay(s, player, 0);
    case "moveWild": {
      const base = validatePlay(s, player, 0);
      if (!base.ok) return base;
      const entry = tableOf(s, player).properties.find((p) => p.card.id === move.cardId);
      if (!entry || entry.card.kind !== "wild") return fail("that wild card is not on your table");
      if (!colorsOf(entry.card).includes(move.color))
        return fail("that wild card can't be that color");
      if (entry.color === move.color) return fail("it is already that color");
      return OK;
    }
  }

  const doubles = move.type === "rent" ? (move.doubles ?? []) : [];
  const base = validatePlay(s, player, 1 + doubles.length);
  if (!base.ok) return base;
  const card = findInHand(s, player, move.cardId);
  if (!card) return fail("that card is not in your hand");
  const table = tableOf(s, player);

  switch (move.type) {
    case "bank":
      if (isPlaceable(card)) return fail("properties can't go in the bank");
      return OK;
    case "property":
      if (card.kind === "property") {
        return card.color === move.color ? OK : fail("that property is a different color");
      }
      if (card.kind === "wild") {
        return colorsOf(card).includes(move.color)
          ? OK
          : fail("that wild card can't be that color");
      }
      return fail("that card is not a property");
    case "building": {
      const action = card.kind === "action" ? card.action : null;
      if (action !== "house" && action !== "hotel")
        return fail("that card is not a house or hotel");
      if (!COLOR_INFO[move.color].buildable)
        return fail("railroads and utilities can't have buildings");
      const { complete } = setInfo(table, move.color);
      const houses = buildingsOn(table, move.color, "house");
      if (action === "house") {
        return houses < complete ? OK : fail("a house needs a complete set without one");
      }
      return buildingsOn(table, move.color, "hotel") < houses
        ? OK
        : fail("a hotel needs a complete set that has a house and no hotel");
    }
    case "rent": {
      if (card.kind !== "rent") return fail("that card is not a rent card");
      if (!colorsOf(card).includes(move.color))
        return fail("that rent card can't charge that color");
      if (rentFor(table, move.color) === 0)
        return fail("you need properties of that color to charge rent");
      if (card.colors === "any") {
        if (!move.target || !others.includes(move.target)) return fail("choose a player to charge");
      } else if (move.target !== undefined) {
        return fail("this rent card charges every other player");
      }
      if (new Set(doubles).size !== doubles.length)
        return fail("each Double The Rent card counts once");
      for (const id of doubles) {
        const double = findInHand(s, player, id);
        if (!double || !isAction(double, "doubleRent"))
          return fail("that is not a Double The Rent card in your hand");
      }
      return OK;
    }
    default: {
      const action = PLAYED_ACTIONS[move.type];
      if (!action || !isAction(card, action)) return fail("that card can't be played that way");
    }
  }

  switch (move.type) {
    case "passGo":
    case "birthday":
      return OK;
    case "debtCollector":
      return others.includes(move.target) ? OK : fail("choose another player");
    case "slyDeal": {
      const owner = ownerOf(s, move.targetCardId);
      if (!owner || owner === player) return fail("choose a property on another player's table");
      return canTakeProperty(tableOf(s, owner), move.targetCardId)
        ? OK
        : fail("properties in a complete set can't be taken");
    }
    case "forcedDeal": {
      const owner = ownerOf(s, move.targetCardId);
      if (!owner || owner === player) return fail("choose a property on another player's table");
      if (ownerOf(s, move.offeredCardId) !== player)
        return fail("offer a property from your table");
      if (
        !canTakeProperty(tableOf(s, owner), move.targetCardId) ||
        !canTakeProperty(table, move.offeredCardId)
      ) {
        return fail("properties in a complete set can't be swapped");
      }
      return OK;
    }
    case "dealBreaker":
      if (!others.includes(move.target)) return fail("choose another player");
      return setInfo(tableOf(s, move.target), move.color).complete > 0
        ? OK
        : fail("that player has no complete set of that color");
  }
  return fail("unknown move");
}

function applyMoveTo(
  s: MonopolyDealState,
  rng: Rng,
  player: PlayerId,
  move: MonopolyDealMove,
): void {
  const p = s.pending;
  switch (move.type) {
    case "justSayNo":
      s.discardPile.push(takeFromHand(s, player, move.cardId));
      if (player === currentPlayer(s)) s.playsLeft--;
      p!.justSayNos++;
      return;
    case "accept":
      acceptCurrent(s, p!);
      return;
    case "pay":
      transferPayment(s, player, p!.actor, move.cardIds);
      nextTarget(p!);
      return;
    case "discard":
      for (const id of move.cardIds) s.discardPile.push(takeFromHand(s, player, id));
      nextTurn(s, rng);
      return;
    case "endTurn":
      if (handOf(s, player).length > s.options.handLimit) s.phase = "discard";
      else nextTurn(s, rng);
      return;
    case "moveWild": {
      const table = tableOf(s, player);
      table.properties.find((t) => t.card.id === move.cardId)!.color = move.color;
      removeInvalidBuildings(table, s.discardPile);
      return;
    }
  }

  const card = takeFromHand(s, player, move.cardId);
  const table = tableOf(s, player);
  const others = s.players
    .map((_, i) => s.players[(s.currentIndex + i) % s.players.length]!)
    .filter((id) => id !== player);
  s.playsLeft--;
  const pend = (
    action: Omit<PendingAction, "actor" | "justSayNos" | "paying" | "amount"> & { amount?: number },
  ) => {
    s.pending = { actor: player, justSayNos: 0, paying: false, amount: 0, ...action };
  };

  switch (move.type) {
    case "bank":
      table.bank.push(card);
      return;
    case "property":
      if (isPlaceable(card)) table.properties.push({ card, color: move.color });
      return;
    case "building":
      if (card.kind === "action") table.buildings.push({ card, color: move.color });
      return;
    case "rent": {
      const doubles = move.doubles ?? [];
      for (const id of doubles) s.discardPile.push(takeFromHand(s, player, id));
      s.playsLeft -= doubles.length;
      s.discardPile.push(card);
      pend({
        kind: "rent",
        color: move.color,
        amount: rentFor(table, move.color) * 2 ** doubles.length,
        targets: card.kind === "rent" && card.colors === "any" ? [move.target!] : others,
      });
      return;
    }
  }

  s.discardPile.push(card);
  switch (move.type) {
    case "passGo":
      draw(s, rng, player, 2);
      return;
    case "debtCollector":
      pend({ kind: "debtCollector", amount: DEBT_COLLECTOR_AMOUNT, targets: [move.target] });
      return;
    case "birthday":
      pend({ kind: "birthday", amount: BIRTHDAY_AMOUNT, targets: others });
      return;
    case "slyDeal":
      pend({
        kind: "slyDeal",
        targetCardId: move.targetCardId,
        targets: [ownerOf(s, move.targetCardId)!],
      });
      return;
    case "forcedDeal":
      pend({
        kind: "forcedDeal",
        targetCardId: move.targetCardId,
        offeredCardId: move.offeredCardId,
        targets: [ownerOf(s, move.targetCardId)!],
      });
      return;
    case "dealBreaker":
      pend({ kind: "dealBreaker", color: move.color, targets: [move.target] });
      return;
  }
}

function legalMoves(s: MonopolyDealState, player: PlayerId): MonopolyDealMove[] {
  if (awaiting(s) !== player) return [];
  const hand = handOf(s, player);
  const p = s.pending;
  const candidates: MonopolyDealMove[] = [];

  if (p?.paying) {
    return suggestPayments(tableOf(s, player), p.amount).map((cardIds) => ({
      type: "pay",
      cardIds,
    }));
  }
  if (p && p.targets.length > 0) {
    const jsn = hand.find((c) => isAction(c, "justSayNo"));
    const responses: MonopolyDealMove[] = [{ type: "accept" }];
    if (jsn) responses.push({ type: "justSayNo", cardId: jsn.id });
    return responses.filter((m) => validateMove(s, player, m).ok);
  }
  if (s.phase === "discard") {
    // Representative choice for bots; any valid discard is accepted.
    const excess = hand.length - s.options.handLimit;
    const cheapest = [...hand].sort((a, b) => a.value - b.value).slice(0, excess);
    return [{ type: "discard", cardIds: cheapest.map((c) => c.id) }];
  }

  const table = tableOf(s, player);
  const others = s.players.filter((id) => id !== player);
  const theirCards = others.flatMap((id) => tableOf(s, id).properties.map((t) => t.card.id));
  const doubles = hand.filter((c) => isAction(c, "doubleRent")).map((c) => c.id);

  candidates.push({ type: "endTurn" });
  for (const entry of table.properties) {
    if (entry.card.kind !== "wild") continue;
    for (const color of colorsOf(entry.card))
      candidates.push({ type: "moveWild", cardId: entry.card.id, color });
  }
  for (const card of hand) {
    const cardId = card.id;
    candidates.push({ type: "bank", cardId });
    if (card.kind === "property") candidates.push({ type: "property", cardId, color: card.color });
    if (card.kind === "wild") {
      for (const color of colorsOf(card)) candidates.push({ type: "property", cardId, color });
    }
    if (card.kind === "rent") {
      for (const color of colorsOf(card)) {
        for (let n = 0; n <= doubles.length; n++) {
          const withDoubles = n > 0 ? { doubles: doubles.slice(0, n) } : {};
          if (card.colors === "any") {
            for (const target of others)
              candidates.push({ type: "rent", cardId, color, target, ...withDoubles });
          } else {
            candidates.push({ type: "rent", cardId, color, ...withDoubles });
          }
        }
      }
    }
    if (card.kind !== "action") continue;
    switch (card.action) {
      case "passGo":
        candidates.push({ type: "passGo", cardId });
        break;
      case "birthday":
        candidates.push({ type: "birthday", cardId });
        break;
      case "debtCollector":
        for (const target of others) candidates.push({ type: "debtCollector", cardId, target });
        break;
      case "slyDeal":
        for (const targetCardId of theirCards)
          candidates.push({ type: "slyDeal", cardId, targetCardId });
        break;
      case "forcedDeal":
        for (const offered of table.properties) {
          for (const targetCardId of theirCards) {
            candidates.push({
              type: "forcedDeal",
              cardId,
              offeredCardId: offered.card.id,
              targetCardId,
            });
          }
        }
        break;
      case "dealBreaker":
        for (const target of others) {
          for (const color of DEAL_COLORS)
            candidates.push({ type: "dealBreaker", cardId, target, color });
        }
        break;
      case "house":
      case "hotel":
        for (const color of DEAL_COLORS) candidates.push({ type: "building", cardId, color });
        break;
    }
  }
  return candidates.filter((m) => validateMove(s, player, m).ok);
}

export const monopolyDeal: GameDefinition<
  MonopolyDealState,
  MonopolyDealMove,
  MonopolyDealView,
  MonopolyDealOptions
> = {
  id: "monopoly-deal",
  name: "Monopoly Deal",
  minPlayers: 2,
  maxPlayers: 5,
  defaultOptions: DEFAULT_MONOPOLY_DEAL_OPTIONS,

  setup({ players, options, seed }) {
    for (const key of ["handSize", "playsPerTurn", "handLimit", "setsToWin"] as const) {
      if (!Number.isInteger(options[key]) || options[key] < 1) {
        throw new RangeError(`${key} must be a positive integer`);
      }
    }
    const rng = createRng(seed);
    const drawPile = rng.shuffle(createDealDeck());
    const hands: Record<PlayerId, DealCard[]> = {};
    const tables: Record<PlayerId, PlayerTable> = {};
    for (const player of players) {
      hands[player] = drawPile.splice(drawPile.length - options.handSize, options.handSize);
      tables[player] = { bank: [], properties: [], buildings: [] };
    }
    const state: MonopolyDealState = {
      options: { ...options },
      players: [...players],
      hands,
      tables,
      drawPile,
      discardPile: [],
      currentIndex: 0,
      playsLeft: options.playsPerTurn,
      phase: "play",
      pending: null,
      winner: null,
      stalemate: false,
      rngState: 0,
    };
    startTurn(state, rng, 0);
    state.rngState = rng.state;
    return state;
  },

  activePlayers(s) {
    const player = awaiting(s);
    return player ? [player] : [];
  },

  legalMoves,
  validateMove,

  applyMove(state, player, move) {
    const s = deepClone(state);
    const rng = createRng(s.rngState);
    applyMoveTo(s, rng, player, move);
    settle(s);
    s.rngState = rng.state;
    return s;
  },

  playerView(s, player) {
    return {
      me: player,
      hand: player && s.hands[player] ? deepClone(s.hands[player]) : [],
      players: s.players.map((id) => ({
        id,
        handCount: handOf(s, id).length,
        table: deepClone(tableOf(s, id)),
      })),
      drawPileCount: s.drawPile.length,
      topDiscard: s.discardPile.at(-1) ?? null,
      currentPlayer: currentPlayer(s),
      phase: s.phase,
      playsLeft: s.playsLeft,
      pending: s.pending ? deepClone(s.pending) : null,
      awaiting: awaiting(s),
      winner: s.winner,
      stalemate: s.stalemate,
      options: { ...s.options },
    };
  },

  result(s) {
    if (s.winner) return { outcome: "win", winners: [s.winner] };
    if (s.stalemate) return { outcome: "draw", winners: [] };
    return null;
  },
};
