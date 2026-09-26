import {
  isValidPayment,
  payableCards,
  type DealCard,
  type MonopolyDealMove,
  type MonopolyDealView,
  type PendingAction,
  type PlayerId,
} from "@cardhub/engine";
import { COLOR_NAMES, dealCardLabel } from "@cardhub/shared";
import { useState, type ReactNode } from "react";
import { Button } from "../../../components/Button";
import { Overlay } from "../../../components/Overlay";
import {
  handCardOf,
  optionLabel,
  ownerOfProperty,
  visibleCards,
  type NameOf,
} from "../moveOptions";
import { DealCardView } from "./DealCardView";
import { PropertySets } from "./PropertySets";

export interface DealTablePlayer {
  id: PlayerId;
  name: string;
  isBot: boolean;
  /** Online only: false while the player is reconnecting. */
  connected: boolean;
}

interface DealTableProps {
  /** Built for the player at this device (`view.me`), or a spectator view when `me` is null. */
  view: MonopolyDealView;
  legalMoves: MonopolyDealMove[];
  /** Changes with every move; resets any open picker. */
  moveCount: number;
  log: string[];
  players: DealTablePlayer[];
  emptyHandMessage: string;
  error: string | null;
  onMove(move: MonopolyDealMove): void;
  onLeave(): void;
  /** Dialogs drawn over the table, e.g. a handoff or game-over screen. */
  children?: ReactNode;
}

type Sheet =
  | { kind: "card"; cardId: string; moveCount: number }
  | { kind: "forced"; cardId: string; targetCardId: string; moveCount: number }
  | { kind: "wild"; cardId: string; moveCount: number };

const bankTotal = (cards: DealCard[]) => cards.reduce((sum, c) => sum + c.value, 0);

function describePending(
  p: PendingAction,
  me: PlayerId | null,
  nameOf: NameOf,
  view: MonopolyDealView,
): string {
  const target = p.targets[0]!;
  const cards = visibleCards(view);
  const what = {
    rent: `${p.color ? COLOR_NAMES[p.color] : ""} rent of ${p.amount}M`,
    debtCollector: "Debt Collector (5M)",
    birthday: "It's My Birthday (2M)",
    slyDeal: `Sly Deal on ${p.targetCardId ? dealCardLabel(cards.get(p.targetCardId)!) : "a property"}`,
    forcedDeal: `Forced Deal for ${p.targetCardId ? dealCardLabel(cards.get(p.targetCardId)!) : "a property"}`,
    dealBreaker: `Deal Breaker on the ${p.color ? COLOR_NAMES[p.color] : ""} set`,
  }[p.kind];
  if (p.justSayNos % 2 === 1) {
    return me === p.actor
      ? `${nameOf(target)} said Just Say No to your ${what}.`
      : `${nameOf(target)} said Just Say No.`;
  }
  const subject = target === me ? "you" : nameOf(target);
  return `${nameOf(p.actor)} played ${what} on ${subject}.`;
}

export function DealTable({
  view,
  legalMoves,
  moveCount,
  log,
  players,
  emptyHandMessage,
  error,
  onMove,
  onLeave,
  children,
}: DealTableProps) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const activeSheet = sheet?.moveCount === moveCount ? sheet : null;
  const nameOf: NameOf = (id) => players.find((p) => p.id === id)?.name ?? "Someone";
  const me = view.me;
  const mine = view.players.find((p) => p.id === me);
  const pending = view.pending;
  const myTurnToAct = me !== null && view.awaiting === me;
  const choosingPlay = myTurnToAct && !pending && view.phase === "play";
  const canEndTurn = legalMoves.some((m) => m.type === "endTurn");
  const playableCards = new Set(legalMoves.map(handCardOf).filter((id): id is string => !!id));
  const recolorable = new Set(legalMoves.flatMap((m) => (m.type === "moveWild" ? [m.cardId] : [])));

  const play = (move: MonopolyDealMove) => {
    setSheet(null);
    onMove(move);
  };

  let status: string;
  if (view.winner) status = "Game over";
  else if (view.stalemate) status = "No cards left: it's a draw";
  else if (myTurnToAct && pending?.paying) status = `You owe ${pending.amount}M`;
  else if (myTurnToAct && pending) status = "Respond to the action";
  else if (myTurnToAct && view.phase === "discard") status = "Discard down to 7";
  else if (myTurnToAct)
    status = `Your turn · ${view.playsLeft} play${view.playsLeft === 1 ? "" : "s"} left`;
  else status = `${nameOf(view.awaiting ?? view.currentPlayer)} is thinking…`;

  const opponents = view.players.filter((p) => p.id !== me);

  return (
    <main className="safe-area mx-auto flex min-h-full max-w-5xl flex-col gap-3 px-4 py-3">
      <header className="flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={onLeave}>
          Leave
        </Button>
        <p className="text-center text-base font-bold" role="status" data-testid="status">
          {status}
        </p>
        {choosingPlay && canEndTurn ? (
          <Button onClick={() => play({ type: "endTurn" })}>End turn</Button>
        ) : (
          <span className="w-20" />
        )}
      </header>

      <ul className="flex flex-col gap-2" aria-label="Players">
        {opponents.map((p) => {
          const info = players.find((x) => x.id === p.id);
          const active = p.id === view.awaiting;
          return (
            <li
              key={p.id}
              className={`rounded-xl px-3 py-2 ring-2 ${active ? "bg-amber-400/15 ring-amber-300" : "bg-felt-800 ring-transparent"} ${info?.connected === false ? "opacity-60" : ""}`}
              data-testid={`opponent-${nameOf(p.id)}`}
            >
              <div className="mb-1 flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-semibold">
                  {nameOf(p.id)}
                  {info?.isBot && <span className="ml-1 text-xs text-white/60">bot</span>}
                  {info?.connected === false && (
                    <span className="ml-1 text-xs text-amber-300">reconnecting…</span>
                  )}
                </span>
                <span className="text-white/70">{p.handCount} in hand</span>
                <span className="text-white/70">Bank {bankTotal(p.table.bank)}M</span>
              </div>
              <PropertySets table={p.table} compact />
            </li>
          );
        })}
      </ul>

      <section className="flex flex-col items-center gap-2 text-sm" aria-label="Table">
        <p className="text-white/70">
          {view.drawPileCount} in draw pile
          {view.topDiscard && <> · last played: {dealCardLabel(view.topDiscard)}</>}
        </p>
        <ol
          className="min-h-14 w-full max-w-xl text-center text-white/85"
          aria-live="polite"
          data-testid="game-log"
        >
          {log.slice(-3).map((entry, i) => (
            <li key={`${moveCount}-${i}`}>{entry}</li>
          ))}
        </ol>
      </section>

      {mine ? (
        <section aria-label="Your area" className="flex flex-col gap-2 rounded-xl bg-black/20 p-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-semibold">{nameOf(mine.id)}</span>
            <span className="text-sm text-white/70" data-testid="my-bank">
              Bank {bankTotal(mine.table.bank)}M
            </span>
          </div>
          <PropertySets
            table={mine.table}
            tappable={choosingPlay ? recolorable : new Set()}
            onTap={(cardId) => setSheet({ kind: "wild", cardId, moveCount })}
          />
          <div className="flex gap-2 overflow-x-auto pt-3 pb-1" aria-label="Your hand">
            {view.hand.map((card) => (
              <DealCardView
                key={card.id}
                card={card}
                active={choosingPlay && playableCards.has(card.id)}
                disabled={!choosingPlay || !playableCards.has(card.id)}
                onClick={() => setSheet({ kind: "card", cardId: card.id, moveCount })}
              />
            ))}
          </div>
        </section>
      ) : (
        <p className="text-center text-white/70">{emptyHandMessage}</p>
      )}

      {error && (
        <p
          className="fixed inset-x-4 bottom-4 z-40 rounded-xl bg-red-600 p-3 text-center"
          role="alert"
        >
          {error}
        </p>
      )}

      {activeSheet?.kind === "card" && (
        <CardOptions
          view={view}
          cardId={activeSheet.cardId}
          legalMoves={legalMoves}
          nameOf={nameOf}
          onPlay={play}
          onForced={(targetCardId) => setSheet({ ...activeSheet, kind: "forced", targetCardId })}
          onClose={() => setSheet(null)}
        />
      )}
      {activeSheet?.kind === "forced" && (
        <Overlay title="Give which of your properties?">
          <OptionList
            moves={legalMoves.filter(
              (m) =>
                m.type === "forcedDeal" &&
                m.cardId === activeSheet.cardId &&
                m.targetCardId === activeSheet.targetCardId,
            )}
            view={view}
            nameOf={nameOf}
            onPlay={play}
          />
          <Button variant="secondary" className="mt-3 w-full" onClick={() => setSheet(null)}>
            Cancel
          </Button>
        </Overlay>
      )}
      {activeSheet?.kind === "wild" && (
        <Overlay title="Move this wild card">
          <OptionList
            moves={legalMoves.filter(
              (m) => m.type === "moveWild" && m.cardId === activeSheet.cardId,
            )}
            view={view}
            nameOf={nameOf}
            onPlay={play}
          />
          <Button variant="secondary" className="mt-3 w-full" onClick={() => setSheet(null)}>
            Cancel
          </Button>
        </Overlay>
      )}

      {myTurnToAct && pending && !pending.paying && (
        <Overlay title={pending.justSayNos % 2 === 1 ? "Just Say No!" : "Action against you"}>
          <p className="mb-4 text-white/85">{describePending(pending, me, nameOf, view)}</p>
          <div className="flex flex-col gap-2">
            {legalMoves.some((m) => m.type === "justSayNo") && (
              <Button onClick={() => play(legalMoves.find((m) => m.type === "justSayNo")!)}>
                {pending.justSayNos % 2 === 1 ? "Counter with Just Say No" : "Just Say No!"}
              </Button>
            )}
            <Button variant="secondary" onClick={() => play({ type: "accept" })}>
              {pending.justSayNos % 2 === 1 ? "Accept their No" : "Accept"}
            </Button>
          </div>
        </Overlay>
      )}

      {myTurnToAct && pending?.paying && mine && (
        <PayDialog
          key={moveCount}
          view={view}
          amount={pending.amount}
          suggestion={legalMoves.find((m) => m.type === "pay")?.cardIds ?? []}
          to={nameOf(pending.actor)}
          onPay={(cardIds) => play({ type: "pay", cardIds })}
        />
      )}

      {myTurnToAct && view.phase === "discard" && !pending && (
        <DiscardDialog
          key={moveCount}
          hand={view.hand}
          count={view.hand.length - view.options.handLimit}
          onDiscard={(cardIds) => play({ type: "discard", cardIds })}
        />
      )}

      {children}
    </main>
  );
}

function OptionList({
  moves,
  view,
  nameOf,
  onPlay,
}: {
  moves: MonopolyDealMove[];
  view: MonopolyDealView;
  nameOf: NameOf;
  onPlay(move: MonopolyDealMove): void;
}) {
  return (
    <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
      {moves.map((move, i) => (
        <Button key={i} variant="secondary" className="text-left" onClick={() => onPlay(move)}>
          {optionLabel(view, move, nameOf)}
        </Button>
      ))}
    </div>
  );
}

function CardOptions({
  view,
  cardId,
  legalMoves,
  nameOf,
  onPlay,
  onForced,
  onClose,
}: {
  view: MonopolyDealView;
  cardId: string;
  legalMoves: MonopolyDealMove[];
  nameOf: NameOf;
  onPlay(move: MonopolyDealMove): void;
  onForced(targetCardId: string): void;
  onClose(): void;
}) {
  const card = view.hand.find((c) => c.id === cardId)!;
  const moves = legalMoves.filter((m) => handCardOf(m) === cardId);
  const forcedTargets = [
    ...new Set(moves.flatMap((m) => (m.type === "forcedDeal" ? [m.targetCardId] : []))),
  ];
  const others = moves.filter((m) => m.type !== "forcedDeal");
  const cards = visibleCards(view);

  return (
    <Overlay title={dealCardLabel(card)}>
      <div className="mb-3 flex justify-center">
        <DealCardView card={card} />
      </div>
      <OptionList moves={others} view={view} nameOf={nameOf} onPlay={onPlay} />
      {forcedTargets.length > 0 && (
        <div className="mt-2 flex max-h-[40vh] flex-col gap-2 overflow-y-auto">
          {forcedTargets.map((targetCardId) => (
            <Button
              key={targetCardId}
              variant="secondary"
              className="text-left"
              onClick={() => onForced(targetCardId)}
            >
              Swap for {dealCardLabel(cards.get(targetCardId)!)} from{" "}
              {nameOf(ownerOfProperty(view, targetCardId)!)}
            </Button>
          ))}
        </div>
      )}
      {card.kind === "action" && card.action === "doubleRent" && (
        <p className="text-sm text-white/70">
          Play it together with a rent card: tap the rent card.
        </p>
      )}
      <Button variant="secondary" className="mt-3 w-full" onClick={onClose}>
        Cancel
      </Button>
    </Overlay>
  );
}

function PayDialog({
  view,
  amount,
  suggestion,
  to,
  onPay,
}: {
  view: MonopolyDealView;
  amount: number;
  suggestion: string[];
  to: string;
  onPay(cardIds: string[]): void;
}) {
  const table = view.players.find((p) => p.id === view.me)!.table;
  const payable = payableCards(table);
  const [selected, setSelected] = useState<string[]>(suggestion);
  const total = payable
    .filter((p) => selected.includes(p.card.id))
    .reduce((s, p) => s + p.card.value, 0);
  const valid = isValidPayment(table, amount, selected);
  const toggle = (id: string) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <Overlay title={`Pay ${to} ${amount}M`}>
      <p className="mb-3 text-sm text-white/70">
        Choose cards from your bank and properties. No change is given.
      </p>
      <div className="flex flex-wrap justify-center gap-2" aria-label="Cards you can pay with">
        {payable.map(({ card, source }) => (
          <div key={card.id} className="flex flex-col items-center gap-1">
            <DealCardView
              card={card}
              selected={selected.includes(card.id)}
              onClick={() => toggle(card.id)}
            />
            <span className="text-[0.6rem] text-white/60">{source}</span>
          </div>
        ))}
      </div>
      <p className="my-3 text-sm" data-testid="pay-total">
        Selected {total}M of {amount}M
      </p>
      <Button className="w-full" disabled={!valid} onClick={() => onPay(selected)}>
        Pay
      </Button>
      {!valid && selected.length > 0 && total >= amount && (
        <p className="mt-2 text-xs text-amber-300">Remove cards you don't need.</p>
      )}
    </Overlay>
  );
}

function DiscardDialog({
  hand,
  count,
  onDiscard,
}: {
  hand: DealCard[];
  count: number;
  onDiscard(cardIds: string[]): void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  return (
    <Overlay title={`Discard ${count} card${count === 1 ? "" : "s"}`}>
      <p className="mb-3 text-sm text-white/70">
        You can keep at most 7 cards at the end of your turn.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {hand.map((card) => (
          <DealCardView
            key={card.id}
            card={card}
            selected={selected.includes(card.id)}
            onClick={() => toggle(card.id)}
          />
        ))}
      </div>
      <Button
        className="mt-3 w-full"
        disabled={selected.length !== count}
        onClick={() => onDiscard(selected)}
      >
        Discard {selected.length}/{count}
      </Button>
    </Overlay>
  );
}
