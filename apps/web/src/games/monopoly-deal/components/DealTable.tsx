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
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { AudioToggles } from "../../../components/AudioToggles";
import { Avatar } from "../../../components/Avatar";
import { Button } from "../../../components/Button";
import { Overlay } from "../../../components/Overlay";
import {
  handCardOf,
  optionLabel,
  ownerOfProperty,
  visibleCards,
  type NameOf,
} from "../moveOptions";
import { useDealEffects } from "../useDealEffects";
import { DealCardBack, DealCardView } from "./DealCardView";
import { TableCards, type ZoneState } from "./TableCards";

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

/** Where a dragged card can be dropped. */
type Zone = "bank" | "property" | "play";
const ZONE_IDS: Record<Zone, string> = {
  bank: "zone-bank",
  property: "zone-property",
  play: "zone-play",
};

function zoneOf(move: MonopolyDealMove): Zone {
  if (move.type === "bank") return "bank";
  if (move.type === "property" || move.type === "building") return "property";
  return "play";
}

type Sheet =
  | { kind: "card"; cardId: string; moveCount: number; only?: Zone }
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

  useDealEffects(view);
  const [dragging, setDragging] = useState<DealCard | null>(null);
  // A short press-and-move starts a drag; a tap still opens the card's options.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const movesFor = (cardId: string, zone: Zone) =>
    legalMoves.filter((m) => handCardOf(m) === cardId && zoneOf(m) === zone);
  const zoneState = (zone: Zone): ZoneState =>
    !dragging ? "idle" : movesFor(dragging.id, zone).length > 0 ? "valid" : "invalid";

  const onDragStart = (event: DragStartEvent) =>
    setDragging(view.hand.find((c) => c.id === event.active.id) ?? null);
  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const zone = (Object.keys(ZONE_IDS) as Zone[]).find((z) => ZONE_IDS[z] === event.over?.id);
    if (!zone) return;
    const cardId = String(event.active.id);
    const moves = movesFor(cardId, zone);
    // One obvious way to play it: do it. Several (colors, targets, rent choices): ask.
    if (moves.length === 1) play(moves[0]!);
    else if (moves.length > 1) setSheet({ kind: "card", cardId, moveCount, only: zone });
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
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <LayoutGroup>
        <main className="safe-area mx-auto flex min-h-full max-w-5xl flex-col gap-3 overflow-x-hidden px-3 py-3">
          <header className="flex items-center justify-between gap-2">
            <Button variant="ghost" className="!min-h-11 !px-4" onClick={onLeave}>
              Leave
            </Button>
            <motion.p
              key={status}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`rounded-full border-[2.5px] border-ink px-4 py-1.5 text-center font-display text-base font-semibold shadow-[2px_3px_0_var(--color-ink)] ${
                myTurnToAct && !view.winner ? "bg-sunny" : "bg-white"
              }`}
              role="status"
              data-testid="status"
            >
              {status}
            </motion.p>
            <div className="flex items-center gap-2">
              <AudioToggles />
              {choosingPlay && canEndTurn && (
                <Button
                  variant="success"
                  className="!min-h-11"
                  onClick={() => play({ type: "endTurn" })}
                >
                  End turn
                </Button>
              )}
            </div>
          </header>

          <ul className="flex flex-col gap-3" aria-label="Players">
            {opponents.map((p) => {
              const info = players.find((x) => x.id === p.id);
              const active = p.id === view.awaiting && !view.winner;
              return (
                <li
                  key={p.id}
                  className={`rounded-3xl border-[2.5px] p-3 ${
                    active
                      ? "border-ink bg-sunny/90 shadow-[3px_4px_0_var(--color-ink)]"
                      : "border-transparent bg-white/85"
                  } ${info?.connected === false ? "opacity-60" : ""}`}
                  data-testid={`opponent-${nameOf(p.id)}`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Avatar
                      name={nameOf(p.id)}
                      isBot={info?.isBot ?? false}
                      size="sm"
                      active={active}
                    />
                    <span className="font-display text-lg font-semibold">{nameOf(p.id)}</span>
                    <span className="rounded-full bg-ink/10 px-2 text-xs font-bold">
                      🂠 {p.handCount} in hand
                    </span>
                    {info?.connected === false && (
                      <span className="text-xs font-bold text-tangerine">reconnecting…</span>
                    )}
                  </div>
                  <TableCards table={p.table} />
                </li>
              );
            })}
          </ul>

          <section className="flex flex-col items-center gap-2 text-sm" aria-label="Table">
            <PlayZone state={zoneState("play")}>
              <div className="relative" aria-label={`${view.drawPileCount} in draw pile`}>
                <span className="absolute top-1.5 left-2 rotate-6">
                  <DealCardBack />
                </span>
                <span className="relative block">
                  <DealCardBack />
                </span>
                <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border-2 border-ink bg-white px-2 text-xs font-bold">
                  {view.drawPileCount}
                </span>
              </div>
              <div className="flex h-28 w-20 items-center justify-center rounded-xl border-[2.5px] border-dashed border-white/60">
                <AnimatePresence initial={false}>
                  {view.topDiscard && (
                    <motion.div
                      key={view.topDiscard.id}
                      layoutId={view.topDiscard.id}
                      initial={{ scale: 1.4, rotate: 30, opacity: 0 }}
                      animate={{ scale: 1, rotate: -4, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 380, damping: 22 }}
                    >
                      <DealCardView card={view.topDiscard} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </PlayZone>
            <p className="sr-only">
              {view.drawPileCount} in draw pile
              {view.topDiscard && <> · last played: {dealCardLabel(view.topDiscard)}</>}
            </p>
            <ol
              className="min-h-12 w-full max-w-xl text-center font-bold text-white [text-shadow:1px_1px_0_var(--color-ink)]"
              aria-live="polite"
              data-testid="game-log"
            >
              {log.slice(-3).map((entry, i, shown) => (
                <li
                  key={`${moveCount}-${i}`}
                  className={i === shown.length - 1 ? "text-base" : "opacity-75"}
                >
                  {entry}
                </li>
              ))}
            </ol>
          </section>

          {mine ? (
            <section aria-label="Your area" className="panel flex flex-col gap-3 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Avatar name={nameOf(mine.id)} size="sm" active={myTurnToAct && !view.winner} />
                <span className="font-display text-lg font-semibold">{nameOf(mine.id)}</span>
                <span className="sr-only" data-testid="my-bank">
                  Bank {bankTotal(mine.table.bank)}M
                </span>
              </div>
              <TableCards
                table={mine.table}
                tappable={choosingPlay ? recolorable : new Set()}
                onTap={(cardId) => setSheet({ kind: "wild", cardId, moveCount })}
                bankZone={{ id: ZONE_IDS.bank, state: zoneState("bank") }}
                propertyZone={{ id: ZONE_IDS.property, state: zoneState("property") }}
              />
              <div
                className="flex gap-2 overflow-x-auto border-t-2 border-dashed border-ink/20 px-1 pt-4 pb-2"
                aria-label="Your hand"
              >
                {view.hand.map((card) => (
                  <HandCard
                    key={card.id}
                    card={card}
                    playable={choosingPlay && playableCards.has(card.id)}
                    hidden={dragging?.id === card.id}
                    onTap={() => setSheet({ kind: "card", cardId: card.id, moveCount })}
                  />
                ))}
              </div>
            </section>
          ) : (
            <p className="text-center font-display text-xl text-white [text-shadow:1px_1px_0_var(--color-ink)]">
              {emptyHandMessage}
            </p>
          )}

          {error && (
            <p
              className="fixed inset-x-4 bottom-4 z-40 rounded-2xl border-[3px] border-ink bg-cherry p-3 text-center font-bold text-white shadow-[3px_4px_0_var(--color-ink)]"
              role="alert"
            >
              {error}
            </p>
          )}

          {activeSheet?.kind === "card" && (
            <CardOptions
              view={view}
              cardId={activeSheet.cardId}
              // After a drop, only the choices for the zone it was dropped on.
              legalMoves={
                activeSheet.only
                  ? legalMoves.filter((m) => zoneOf(m) === activeSheet.only)
                  : legalMoves
              }
              nameOf={nameOf}
              onPlay={play}
              onForced={(targetCardId) =>
                setSheet({ ...activeSheet, kind: "forced", targetCardId })
              }
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
              <div className="mb-3 flex items-center justify-center gap-3">
                <Avatar
                  name={nameOf(pending.actor)}
                  isBot={players.find((p) => p.id === pending.actor)?.isBot ?? false}
                />
                {view.topDiscard && (
                  <motion.div
                    initial={{ rotate: -20, scale: 0.6 }}
                    animate={{ rotate: -6, scale: 1 }}
                  >
                    <DealCardView card={view.topDiscard} />
                  </motion.div>
                )}
              </div>
              <p className="mb-4 font-bold text-ink/80">
                {describePending(pending, me, nameOf, view)}
              </p>
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
          <JustSayNoStamp log={log} moveCount={moveCount} />
        </main>
      </LayoutGroup>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <DealCardView
            card={dragging}
            className="rotate-6 scale-110 shadow-[6px_8px_0_var(--color-ink)]"
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

/** The center pile: where actions and rent are dropped. */
function PlayZone({ state, children }: { state: ZoneState; children: ReactNode }) {
  // Always enabled: dnd-kit measures drop zones when a drag starts; invalid drops are ignored.
  const { setNodeRef, isOver } = useDroppable({ id: ZONE_IDS.play });
  return (
    <div
      ref={setNodeRef}
      className={`relative flex items-center gap-6 rounded-3xl px-6 py-3 transition ${
        state === "valid"
          ? isOver
            ? "bg-sunny/60 outline-4 outline-sunny"
            : "bg-sunny/20 outline-4 outline-dashed outline-sunny"
          : state === "invalid"
            ? "opacity-50"
            : ""
      }`}
    >
      {children}
      {state === "valid" && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border-2 border-ink bg-sunny px-2 text-xs font-extrabold">
          ⚡ Play
        </span>
      )}
    </div>
  );
}

function HandCard({
  card,
  playable,
  hidden,
  onTap,
}: {
  card: DealCard;
  playable: boolean;
  hidden: boolean;
  onTap(): void;
}) {
  const { setNodeRef, attributes, listeners } = useDraggable({ id: card.id, disabled: !playable });
  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      tabIndex={-1}
      role={undefined}
      layoutId={card.id}
      className="touch-none"
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: hidden ? 0.25 : 1 }}
    >
      <DealCardView card={card} active={playable} disabled={!playable} onClick={onTap} />
    </motion.div>
  );
}

/** A big "JUST SAY NO!" slammed onto the table whenever one is played. */
function JustSayNoStamp({ log, moveCount }: { log: string[]; moveCount: number }) {
  const said = log.slice(-2).some((line) => line.endsWith("said Just Say No!"));
  return (
    <AnimatePresence>
      {said && (
        <motion.div
          key={moveCount}
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.6, times: [0, 0.1, 0.75, 1] }}
        >
          <motion.span
            className="rounded-3xl border-[5px] border-cherry bg-white/90 px-6 py-3 font-display text-5xl font-bold text-cherry shadow-[6px_8px_0_var(--color-ink)]"
            initial={{ scale: 3, rotate: -25 }}
            animate={{ scale: 1, rotate: -8 }}
            transition={{ type: "spring", stiffness: 500, damping: 14 }}
          >
            JUST SAY NO!
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
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
        <p className="text-sm text-ink/60">Play it together with a rent card: tap the rent card.</p>
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
      <p className="mb-3 text-sm text-ink/60">
        Choose cards from your bank and properties. No change is given.
      </p>
      <div className="flex flex-col gap-3" aria-label="Cards you can pay with">
        {(
          [
            ["💰 Bank", payable.filter((p) => p.source !== "property")],
            ["🏠 Properties", payable.filter((p) => p.source === "property")],
          ] as const
        ).map(([heading, group]) =>
          group.length === 0 ? null : (
            <div key={heading} className="rounded-2xl bg-cloud p-2">
              <p className="mb-1 text-left text-xs font-extrabold">{heading}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                {group.map(({ card }) => (
                  <DealCardView
                    key={card.id}
                    card={card}
                    selected={selected.includes(card.id)}
                    onClick={() => toggle(card.id)}
                  />
                ))}
              </div>
            </div>
          ),
        )}
      </div>
      <p
        className={`my-3 rounded-full border-2 border-ink px-3 py-1 font-display text-lg font-semibold ${
          total >= amount ? "bg-mint" : "bg-white"
        }`}
        data-testid="pay-total"
      >
        Selected {total}M of {amount}M
      </p>
      <Button className="w-full" disabled={!valid} onClick={() => onPay(selected)}>
        Pay
      </Button>
      {!valid && selected.length > 0 && total >= amount && (
        <p className="mt-2 text-xs text-cherry">Remove cards you don't need.</p>
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
      <p className="mb-3 text-sm text-ink/60">
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
