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
import {
  isWild,
  UNO_COLORS,
  type PlayerId,
  type UnoCard,
  type UnoColor,
  type UnoMove,
  type UnoView,
} from "@cardhub/engine";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { AudioToggles } from "../../../components/AudioToggles";
import { Avatar } from "../../../components/Avatar";
import { Button } from "../../../components/Button";
import { Overlay } from "../../../components/Overlay";
import { RoundTable } from "../../../components/RoundTable";
import { useElementSize, useMediaQuery } from "../../../hooks/useElementSize";
import { fanLayout } from "../../../lib/fan";
import { trustedPointerListeners } from "../../../lib/dnd";
import { play } from "../../../audio/sound";
import { useUnoEffects } from "../useUnoEffects";
import { UNO_HEX, UnoCardBack, UnoCardView } from "./UnoCardView";

export interface TablePlayer {
  id: PlayerId;
  name: string;
  isBot: boolean;
  /** Online only: false while the player is reconnecting. */
  connected: boolean;
}

interface UnoTableProps {
  /** Built for the player at this device (`view.me`), or a spectator view when `me` is null. */
  view: UnoView;
  legalMoves: UnoMove[];
  /** Changes with every move; resets pending pickers and the UNO call. */
  moveCount: number;
  log: string[];
  players: TablePlayer[];
  /** Shown instead of a hand when `view.me` is null. */
  emptyHandMessage: string;
  error: string | null;
  onMove(move: UnoMove): void;
  onLeave(): void;
  /** Dialogs drawn over the table, e.g. a handoff or game-over screen. */
  children?: ReactNode;
}

const KIND_ORDER: UnoCard["kind"][] = [
  "number",
  "skip",
  "reverse",
  "drawTwo",
  "wild",
  "wildDrawFour",
];

function sortHand(hand: UnoCard[]): UnoCard[] {
  const colorRank = (c: UnoCard) => (isWild(c) ? UNO_COLORS.length : UNO_COLORS.indexOf(c.color));
  return [...hand].sort(
    (a, b) =>
      colorRank(a) - colorRank(b) ||
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      (a.kind === "number" && b.kind === "number" ? a.value - b.value : 0),
  );
}

/** A stable little tilt per card, so the discard pile looks tossed rather than stacked. */
function tiltOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 33 + ch.charCodeAt(0)) % 997;
  return (h % 25) - 12;
}

const DISCARD_ID = "discard-pile";
const COMPACT_QUERY = "(max-width: 639px), (max-height: 760px)";
/** Width of a hand card (the "md" size) and the strip of it that must stay visible. */
const CARD_WIDTH = 80;
const MIN_VISIBLE = 26;

type Choice = { cardId: string; step: "color" | "target"; moveCount: number };

export function UnoTable({
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
}: UnoTableProps) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [unoCalledAt, setUnoCalledAt] = useState<number | null>(null);
  const [dragging, setDragging] = useState<UnoCard | null>(null);
  // A short press-and-move starts a drag; a tap still plays the card.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  useUnoEffects(view);
  // Phones and short screens: smaller piles so the whole table fits without scrolling.
  const compact = useMediaQuery(COMPACT_QUERY);
  const pileSize = compact ? "md" : "lg";

  const viewer = view.me;
  const current = view.currentPlayer;
  const playable = new Set(legalMoves.flatMap((m) => (m.type === "play" ? [m.cardId] : [])));
  const canDraw = legalMoves.some((m) => m.type === "draw");
  const canPass = legalMoves.some((m) => m.type === "pass");
  const unoCalled = unoCalledAt === moveCount;
  const activeChoice = choice?.moveCount === moveCount ? choice : null;
  const playerOf = (id: PlayerId) => players.find((p) => p.id === id);
  const nameOf = (id: PlayerId) => playerOf(id)?.name ?? "Someone";

  const submit = (cardId: string, extra: { color?: UnoColor; target?: PlayerId } = {}) => {
    setChoice(null);
    onMove({ type: "play", cardId, ...extra, ...(unoCalled ? { uno: true } : {}) });
  };

  const playCard = (card: UnoCard) => {
    if (!playable.has(card.id)) return;
    const needsTarget = legalMoves.some(
      (m) => m.type === "play" && m.cardId === card.id && m.target,
    );
    if (isWild(card)) setChoice({ cardId: card.id, step: "color", moveCount });
    else if (needsTarget) setChoice({ cardId: card.id, step: "target", moveCount });
    else submit(card.id);
  };

  const onDragStart = (event: DragStartEvent) => {
    setDragging(view.hand.find((c) => c.id === event.active.id) ?? null);
  };
  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const card = view.hand.find((c) => c.id === event.active.id);
    if (card && event.over?.id === DISCARD_ID) playCard(card);
  };

  let status: string;
  if (view.winner) status = "Game over";
  else if (viewer === current && view.pendingDraw > 0)
    status = `Stack a draw card or take ${view.pendingDraw}`;
  else if (viewer === current && view.hasDrawn) status = "Play the card you drew, or pass";
  else if (viewer === current) status = "Your turn";
  else status = `${nameOf(current)}'s turn`;

  // Seats in turn order, starting with whoever plays after the viewer.
  const seatStart = Math.max(
    0,
    view.players.findIndex((p) => p.id === viewer),
  );
  const opponents = [
    ...view.players.slice(seatStart + 1),
    ...view.players.slice(0, seatStart),
  ].filter((p) => p.id !== viewer);
  // Big tables get smaller seats so everyone fits around the rim.
  const dense = opponents.length > (compact ? 4 : 6);
  const hand = sortHand(view.hand);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <LayoutGroup>
        <main className="safe-area mx-auto flex h-dvh max-w-5xl flex-col gap-1 overflow-hidden px-2 sm:gap-2 sm:px-3">
          <header className="flex items-center justify-between gap-2">
            <Button variant="ghost" className="!min-h-11 shrink-0 !px-4" onClick={onLeave}>
              Leave
            </Button>
            <motion.p
              key={status}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`min-w-0 truncate rounded-full border-[2.5px] border-ink px-3 py-1 text-center font-display text-base font-semibold shadow-[2px_3px_0_var(--color-ink)] sm:px-4 sm:py-1.5 sm:text-lg ${
                viewer === current && !view.winner ? "bg-sunny" : "bg-white"
              }`}
              role="status"
              data-testid="status"
            >
              {status}
            </motion.p>
            <AudioToggles />
          </header>

          <RoundTable
            felt={["#3fe0b0", "#10956d"]}
            dense={dense}
            seats={opponents.map((p) => ({
              id: p.id,
              content: (
                <OpponentSeat
                  name={nameOf(p.id)}
                  isBot={playerOf(p.id)?.isBot ?? false}
                  connected={playerOf(p.id)?.connected ?? true}
                  cardCount={p.cardCount}
                  isTurn={p.id === current && !view.winner}
                  dense={dense}
                />
              ),
            }))}
            mySeat={
              viewer && (
                <span
                  className={`flex items-center gap-1.5 rounded-full border-[2.5px] border-ink py-0.5 pr-3 pl-0.5 shadow-[2px_3px_0_var(--color-ink)] ${
                    viewer === current && !view.winner ? "bg-sunny" : "bg-white"
                  }`}
                >
                  <Avatar
                    name={nameOf(viewer)}
                    size="sm"
                    active={viewer === current && !view.winner}
                  />
                  <span className="max-w-32 truncate font-display font-semibold">
                    {nameOf(viewer)}
                  </span>
                </span>
              )
            }
          >
            <div className="flex items-center gap-5 sm:gap-8">
              <motion.button
                type="button"
                onClick={() => onMove({ type: "draw" })}
                disabled={!canDraw}
                aria-label={view.pendingDraw > 0 ? `Draw ${view.pendingDraw} cards` : "Draw a card"}
                className="relative rounded-2xl enabled:cursor-pointer disabled:cursor-default"
                whileHover={canDraw ? { scale: 1.05, rotate: -2 } : {}}
                whileTap={canDraw ? { scale: 0.95 } : {}}
              >
                {/* A stack: two offset backs peeking out under the top one. */}
                <span className="absolute top-2.5 left-3 rotate-6" aria-hidden>
                  <UnoCardBack size={pileSize} />
                </span>
                <span className="absolute top-1 left-1.5 rotate-3" aria-hidden>
                  <UnoCardBack size={pileSize} />
                </span>
                <span className="relative block">
                  <UnoCardBack
                    size={pileSize}
                    className={
                      canDraw ? "ring-4 ring-sunny ring-offset-2 ring-offset-mint-dark" : ""
                    }
                  />
                </span>
                <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border-2 border-ink bg-white px-2 text-xs font-bold">
                  {view.drawPileCount}
                </span>
              </motion.button>

              <DiscardPile view={view} highlight={dragging !== null} size={pileSize} />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs font-bold sm:gap-2 sm:text-sm">
              <span className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-white px-2.5 py-0.5">
                <span
                  className="inline-block size-3.5 rounded-full border-2 border-ink"
                  style={{ background: UNO_HEX[view.currentColor] }}
                  data-testid="current-color"
                  aria-label={view.currentColor}
                />
                <span className="capitalize">{view.currentColor}</span>
              </span>
              <span
                className="flex items-center gap-1 rounded-full border-2 border-ink bg-white px-2.5 py-0.5"
                aria-label={view.direction === 1 ? "Clockwise" : "Counter-clockwise"}
              >
                <motion.span
                  className="inline-block"
                  animate={{ rotate: view.direction === 1 ? 360 : -360 }}
                  transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
                >
                  {view.direction === 1 ? "↻" : "↺"}
                </motion.span>
                <span className="hidden sm:inline">
                  {view.direction === 1 ? "Clockwise" : "Counter"}
                </span>
              </span>
              <AnimatePresence>
                {view.pendingDraw > 0 && (
                  <motion.strong
                    className="rounded-full border-2 border-ink bg-cherry px-2.5 py-0.5 text-white"
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.3, 1] }}
                    exit={{ scale: 0 }}
                  >
                    +{view.pendingDraw} pending
                  </motion.strong>
                )}
              </AnimatePresence>
            </div>

            <ol
              className="w-full max-w-md text-center text-xs font-bold text-white [text-shadow:1px_1px_0_var(--color-ink)] sm:text-sm"
              aria-live="polite"
              data-testid="game-log"
            >
              {log.slice(-2).map((entry, i, shown) => (
                <li
                  key={`${moveCount}-${i}`}
                  className={`truncate ${i === shown.length - 1 ? "" : "opacity-70"}`}
                >
                  {entry}
                </li>
              ))}
            </ol>

            {viewer && (
              <div className="flex min-h-10 items-center gap-2">
                <AnimatePresence>
                  {view.hand.length === 2 && playable.size > 0 && (
                    <motion.button
                      key="uno"
                      type="button"
                      aria-pressed={unoCalled}
                      className={`cursor-pointer rounded-full border-[3px] border-ink px-5 py-1 font-display text-xl font-bold shadow-[3px_4px_0_var(--color-ink)] ${
                        unoCalled ? "bg-cherry text-white" : "bg-white text-cherry"
                      }`}
                      initial={{ scale: 0 }}
                      animate={unoCalled ? { scale: 1, rotate: -6 } : { scale: [1, 1.12, 1] }}
                      transition={unoCalled ? {} : { repeat: Infinity, duration: 1 }}
                      exit={{ scale: 0, transition: { duration: 0.15, repeat: 0 } }}
                      onClick={() => {
                        if (!unoCalled) play("uno");
                        setUnoCalledAt(unoCalled ? null : moveCount);
                      }}
                    >
                      UNO!
                    </motion.button>
                  )}
                </AnimatePresence>
                {canPass && (
                  <Button
                    variant="secondary"
                    className="!min-h-10"
                    onClick={() => onMove({ type: "pass" })}
                  >
                    Pass
                  </Button>
                )}
              </div>
            )}
          </RoundTable>

          <section aria-label="Your hand" className="shrink-0 pb-1">
            {viewer ? (
              <Hand
                myTurn={viewer === current && !view.winner}
                hand={hand}
                playable={playable}
                draggingId={dragging?.id ?? null}
                onPlay={playCard}
              />
            ) : (
              <p className="py-6 text-center font-display text-xl text-white [text-shadow:1px_1px_0_var(--color-ink)]">
                {emptyHandMessage}
              </p>
            )}
          </section>

          <AnimatePresence>
            {error && (
              <motion.p
                className="fixed inset-x-4 bottom-4 z-40 rounded-2xl border-[3px] border-ink bg-cherry p-3 text-center font-bold text-white shadow-[3px_4px_0_var(--color-ink)]"
                role="alert"
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1, x: [0, -6, 6, -3, 0] }}
                exit={{ y: 40, opacity: 0 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {activeChoice?.step === "color" && (
            <Overlay title="Choose a color">
              <div className="grid grid-cols-2 gap-3">
                {UNO_COLORS.map((color) => (
                  <motion.button
                    key={color}
                    type="button"
                    className="min-h-20 cursor-pointer rounded-3xl border-[3px] border-ink font-display text-2xl font-bold capitalize shadow-[3px_4px_0_var(--color-ink)]"
                    style={{
                      background: UNO_HEX[color],
                      color: color === "yellow" || color === "green" ? "#1f1a4d" : "white",
                    }}
                    whileHover={{ scale: 1.05, rotate: -2 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      play("pop");
                      submit(activeChoice.cardId, { color });
                    }}
                  >
                    {color}
                  </motion.button>
                ))}
              </div>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => setChoice(null)}>
                Cancel
              </Button>
            </Overlay>
          )}

          {activeChoice?.step === "target" && (
            <Overlay title="Swap hands with">
              <div className="flex flex-col gap-2">
                {opponents.map((p) => (
                  <Button
                    key={p.id}
                    variant="secondary"
                    onClick={() => submit(activeChoice.cardId, { target: p.id })}
                  >
                    <span className="flex items-center justify-center gap-3">
                      <Avatar
                        name={nameOf(p.id)}
                        isBot={playerOf(p.id)?.isBot ?? false}
                        size="sm"
                      />
                      {nameOf(p.id)} ({p.cardCount} cards)
                    </span>
                  </Button>
                ))}
              </div>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => setChoice(null)}>
                Cancel
              </Button>
            </Overlay>
          )}

          {children}
        </main>
      </LayoutGroup>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <UnoCardView
            card={dragging}
            size="md"
            className="rotate-6 scale-110 shadow-[6px_8px_0_#1f1a4d]"
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

function DiscardPile({
  view,
  highlight,
  size,
}: {
  view: UnoView;
  highlight: boolean;
  size: "md" | "lg";
}) {
  const { isOver, setNodeRef } = useDroppable({ id: DISCARD_ID });
  const top = view.topCard;
  return (
    <div
      ref={setNodeRef}
      className={`relative flex items-center justify-center rounded-full transition ${size === "lg" ? "size-36" : "size-28"} ${
        isOver ? "scale-110" : highlight ? "scale-105" : ""
      }`}
      // The pile glows in the current color, brighter while a card is dragged over it.
      style={{
        background: `radial-gradient(circle, ${UNO_HEX[view.currentColor]}${isOver ? "cc" : "66"} 0%, transparent 70%)`,
      }}
      data-testid="top-card"
    >
      <span
        className={`absolute rotate-12 rounded-2xl border-[3px] border-ink/40 bg-white/40 ${size === "lg" ? "size-28" : "size-20"}`}
        aria-hidden
      />
      <AnimatePresence initial={false}>
        <motion.div
          key={top.id}
          className="absolute"
          initial={{ scale: 1.5, rotate: tiltOf(top.id) + 90, opacity: 0, y: -60 }}
          animate={{ scale: 1, rotate: tiltOf(top.id), opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
          transition={{ type: "spring", stiffness: 380, damping: 22 }}
        >
          <UnoCardView card={top} size={size} layoutId={top.id} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Hand({
  hand,
  playable,
  myTurn,
  draggingId,
  onPlay,
}: {
  hand: UnoCard[];
  playable: ReadonlySet<string>;
  myTurn: boolean;
  draggingId: string | null;
  onPlay(card: UnoCard): void;
}) {
  const [measure, { width }] = useElementSize<HTMLDivElement>();
  // Overlap just enough to fit, leaving a strip of each card to tap; a big hand gets more rows
  // rather than scrolling.
  const { rows, overlap } = fanLayout(hand.length, width - 16, CARD_WIDTH, MIN_VISIBLE);
  const liftScale = rows.length > 1 ? 0.8 : 1.6;
  const widest = Math.max(0, ...rows.map((row) => row.length));
  // Room below for the outer cards, which dip down and tilt at the ends of the arc.
  const dip = (Math.max(0, widest - 1) / 2) ** 1.6 * liftScale + 18;
  return (
    <div
      ref={measure}
      className="flex w-full flex-col items-center px-2 pt-3"
      style={{ paddingBottom: dip }}
    >
      {rows.map((row, r) => {
        const n = row.length;
        // Fan each row in an arc; the more cards, the flatter the arc.
        const spread = Math.min(7, 50 / Math.max(n, 1));
        return (
          <div key={r} className={`flex justify-center ${r > 0 ? "-mt-20" : ""}`}>
            <AnimatePresence initial={false}>
              {row.map((index, i) => {
                const card = hand[index]!;
                const offset = i - (n - 1) / 2;
                return (
                  <HandCard
                    key={card.id}
                    card={card}
                    playable={playable.has(card.id)}
                    dimmed={myTurn && !playable.has(card.id)}
                    hidden={card.id === draggingId}
                    rotate={offset * spread}
                    lift={Math.abs(offset) ** 1.6 * liftScale}
                    marginLeft={i === 0 ? 0 : -overlap}
                    onPlay={onPlay}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/** Another player's place at the table: who they are, how many cards they hold, whose turn. */
function OpponentSeat({
  name,
  isBot,
  connected,
  cardCount,
  isTurn,
  dense,
}: {
  name: string;
  isBot: boolean;
  connected: boolean;
  cardCount: number;
  isTurn: boolean;
  dense: boolean;
}) {
  const backs = Math.min(cardCount, 4);
  const cards = cardCount === 1 ? "card" : "cards";
  if (dense) {
    return (
      <div
        className={`relative flex w-[3.7rem] flex-col items-center rounded-2xl border-2 border-ink px-0.5 pt-1 pb-0.5 ${
          isTurn ? "bg-sunny shadow-[2px_3px_0_var(--color-ink)]" : "bg-white/90"
        } ${connected ? "" : "opacity-60"}`}
      >
        <span className="relative">
          <Avatar name={name} isBot={isBot} size="sm" active={isTurn} />
          <span
            className="absolute -right-3 -bottom-1 rounded-full border-2 border-ink bg-ink px-1 text-[0.65rem] leading-tight font-black text-white"
            data-testid={`card-count-${name}`}
          >
            {cardCount}
            <span className="sr-only"> {cards}</span>
          </span>
        </span>
        <span className="w-full truncate text-center text-[0.65rem] font-bold">{name}</span>
        <AnimatePresence>
          {cardCount === 1 && (
            <motion.strong
              key="uno"
              className="absolute -top-3 -right-2 rounded-full border-2 border-ink bg-cherry px-1.5 font-display text-xs text-white"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.5, 1], rotate: 8 }}
              exit={{ scale: 0 }}
            >
              UNO!
            </motion.strong>
          )}
        </AnimatePresence>
      </div>
    );
  }
  return (
    <div
      className={`relative flex w-[4.9rem] flex-col items-center rounded-2xl border-[2.5px] border-ink px-1 pt-1 pb-1 transition sm:w-28 ${
        isTurn ? "bg-sunny shadow-[3px_4px_0_var(--color-ink)]" : "bg-white/90"
      } ${connected ? "" : "opacity-60"}`}
    >
      <span className="flex items-end gap-1">
        <Avatar name={name} isBot={isBot} size="sm" active={isTurn} />
        {/* A mini fan of card backs. */}
        <span className="flex h-8 items-end pl-2" aria-hidden>
          {Array.from({ length: backs }, (_, i) => (
            <UnoCardBack
              key={i}
              size="sm"
              className="-ml-3 !h-7 !w-5 origin-bottom !rounded-md !border-[1.5px] first:ml-0"
              style={{ rotate: (i - (backs - 1) / 2) * 12 }}
            />
          ))}
        </span>
      </span>
      <span className="w-full truncate text-center font-display text-xs font-semibold sm:text-sm">
        {name}
      </span>
      <span
        className="text-[0.65rem] leading-tight font-bold text-ink/70 sm:text-xs"
        data-testid={`card-count-${name}`}
      >
        {cardCount} {cards}
        {!connected && " · away"}
      </span>
      <AnimatePresence>
        {cardCount === 1 && (
          <motion.strong
            key="uno"
            className="absolute -top-3 -right-2 rounded-full border-2 border-ink bg-cherry px-2 font-display text-sm text-white shadow-[2px_2px_0_var(--color-ink)]"
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: [0, 1.5, 1], rotate: 8 }}
            exit={{ scale: 0 }}
          >
            UNO!
          </motion.strong>
        )}
      </AnimatePresence>
      {isTurn && (
        <span
          className="absolute -bottom-2.5 flex gap-1 rounded-full border-2 border-ink bg-white px-2 py-0.5"
          aria-hidden
        >
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-1.5 rounded-full bg-ink"
              animate={{ y: [0, -3, 0] }}
              transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
            />
          ))}
        </span>
      )}
    </div>
  );
}

function HandCard({
  card,
  playable,
  dimmed,
  hidden,
  rotate,
  lift,
  marginLeft,
  onPlay,
}: {
  card: UnoCard;
  playable: boolean;
  dimmed: boolean;
  hidden: boolean;
  rotate: number;
  lift: number;
  marginLeft: number;
  onPlay(card: UnoCard): void;
}) {
  const { setNodeRef, attributes, listeners } = useDraggable({ id: card.id, disabled: !playable });
  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...trustedPointerListeners(listeners)}
      tabIndex={-1}
      role={undefined}
      className="touch-none"
      style={{ marginLeft, zIndex: playable ? 2 : 1 }}
      initial={{ y: -220, opacity: 0, scale: 0.6 }}
      animate={{ y: lift - (playable ? 10 : 0), rotate, opacity: hidden ? 0.25 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
    >
      <UnoCardView
        card={card}
        playable={playable}
        dimmed={dimmed}
        onClick={() => onPlay(card)}
        layoutId={card.id}
        className={playable ? "ring-4 ring-sunny" : ""}
      />
    </motion.div>
  );
}

/** Winner announcement; `children` are the buttons (play again, leave, …). */
export function GameOverDialog({
  winnerName,
  points,
  children,
}: {
  winnerName: string;
  points: number;
  children: ReactNode;
}) {
  return (
    <Overlay title={`${winnerName} wins!`}>
      <motion.div
        className="mb-2 text-7xl"
        initial={{ scale: 0, rotate: -40 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 10, delay: 0.15 }}
        aria-hidden
      >
        🏆
      </motion.div>
      <p className="mb-4 font-bold text-ink/70">Scored {points} points from the other hands.</p>
      <div className="flex flex-col gap-3">{children}</div>
    </Overlay>
  );
}
