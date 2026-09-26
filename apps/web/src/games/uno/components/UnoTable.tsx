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
import { useCallback, useState, type ReactNode } from "react";
import { AudioToggles } from "../../../components/AudioToggles";
import { Avatar } from "../../../components/Avatar";
import { Button } from "../../../components/Button";
import { Overlay } from "../../../components/Overlay";
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

  const opponents = view.players.filter((p) => p.id !== viewer);
  const hand = sortHand(view.hand);

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
              className={`rounded-full border-[2.5px] border-ink px-4 py-1.5 text-center font-display text-lg font-semibold shadow-[2px_3px_0_var(--color-ink)] ${
                viewer === current && !view.winner ? "bg-sunny" : "bg-white"
              }`}
              role="status"
              data-testid="status"
            >
              {status}
            </motion.p>
            <AudioToggles />
          </header>

          <ul
            className="flex justify-center gap-3 overflow-x-auto px-1 pt-2 pb-3"
            aria-label="Players"
          >
            {opponents.map((p) => {
              const player = playerOf(p.id);
              const isTurn = p.id === current && !view.winner;
              return (
                <li
                  key={p.id}
                  className={`relative flex min-w-24 shrink-0 flex-col items-center gap-1 rounded-3xl border-[2.5px] px-3 pt-2 pb-2 transition ${
                    isTurn
                      ? "border-ink bg-sunny shadow-[3px_4px_0_var(--color-ink)]"
                      : "border-transparent bg-white/85"
                  } ${player?.connected === false ? "opacity-60" : ""}`}
                >
                  <Avatar name={nameOf(p.id)} isBot={player?.isBot ?? false} active={isTurn} />
                  <span className="max-w-24 truncate font-display font-semibold">
                    {nameOf(p.id)}
                  </span>
                  {/* A mini fan of card backs, one per card (up to a handful). */}
                  <span className="flex h-10 items-end pl-3" aria-hidden>
                    {Array.from({ length: Math.min(p.cardCount, 7) }, (_, i) => (
                      <UnoCardBack
                        key={i}
                        size="sm"
                        className="-ml-4 !h-9 !w-6 origin-bottom first:ml-0"
                        style={{ rotate: (i - (Math.min(p.cardCount, 7) - 1) / 2) * 10 }}
                      />
                    ))}
                  </span>
                  <span
                    className="text-xs font-bold text-ink/70"
                    data-testid={`card-count-${nameOf(p.id)}`}
                  >
                    {p.cardCount} {p.cardCount === 1 ? "card" : "cards"}
                    {player?.connected === false && " · reconnecting…"}
                  </span>
                  <AnimatePresence>
                    {p.cardCount === 1 && (
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
                      className="absolute -bottom-3 flex gap-1 rounded-full border-2 border-ink bg-white px-2 py-0.5"
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
                </li>
              );
            })}
          </ul>

          <section className="flex flex-col items-center justify-center gap-2" aria-label="Table">
            <div className="flex items-center gap-8">
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
                  <UnoCardBack size="lg" />
                </span>
                <span className="absolute top-1 left-1.5 rotate-3" aria-hidden>
                  <UnoCardBack size="lg" />
                </span>
                <span className="relative block">
                  <UnoCardBack
                    size="lg"
                    className={canDraw ? "ring-4 ring-sunny ring-offset-2 ring-offset-grape" : ""}
                  />
                </span>
                <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border-2 border-ink bg-white px-2 text-xs font-bold">
                  {view.drawPileCount}
                </span>
              </motion.button>

              <DiscardPile view={view} highlight={dragging !== null} />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 font-bold">
              <span className="flex items-center gap-2 rounded-full border-2 border-ink bg-white px-3 py-1 text-sm">
                <span
                  className="inline-block size-4 rounded-full border-2 border-ink"
                  style={{ background: UNO_HEX[view.currentColor] }}
                  data-testid="current-color"
                  aria-label={view.currentColor}
                />
                <span className="capitalize">{view.currentColor}</span>
              </span>
              <span
                className="flex items-center gap-1 rounded-full border-2 border-ink bg-white px-3 py-1 text-sm"
                aria-label={view.direction === 1 ? "Clockwise" : "Counter-clockwise"}
              >
                <motion.span
                  className="inline-block"
                  animate={{ rotate: view.direction === 1 ? 360 : -360 }}
                  transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
                >
                  {view.direction === 1 ? "↻" : "↺"}
                </motion.span>
                {view.direction === 1 ? "Clockwise" : "Counter"}
              </span>
              <AnimatePresence>
                {view.pendingDraw > 0 && (
                  <motion.strong
                    className="rounded-full border-2 border-ink bg-cherry px-3 py-1 text-sm text-white"
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
              className="min-h-10 text-center text-sm font-bold text-white [text-shadow:1px_1px_0_var(--color-ink)]"
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

          <section
            aria-label="Your hand"
            className="mt-auto flex flex-col items-center gap-1 pb-10"
          >
            {viewer ? (
              <>
                <div className="flex items-center justify-center gap-2">
                  <Avatar
                    name={nameOf(viewer)}
                    size="sm"
                    active={viewer === current && !view.winner}
                  />
                  <span className="font-display text-lg font-semibold text-white [text-shadow:1px_1px_0_var(--color-ink)]">
                    {nameOf(viewer)}
                  </span>
                  <AnimatePresence>
                    {view.hand.length === 2 && playable.size > 0 && (
                      <motion.button
                        key="uno"
                        type="button"
                        aria-pressed={unoCalled}
                        className={`cursor-pointer rounded-full border-[3px] border-ink px-5 py-1.5 font-display text-xl font-bold shadow-[3px_4px_0_var(--color-ink)] ${
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
                <Hand
                  myTurn={viewer === current && !view.winner}
                  hand={hand}
                  playable={playable}
                  draggingId={dragging?.id ?? null}
                  onPlay={playCard}
                />
              </>
            ) : (
              <p className="pb-4 text-center font-display text-xl text-white [text-shadow:1px_1px_0_var(--color-ink)]">
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

function DiscardPile({ view, highlight }: { view: UnoView; highlight: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: DISCARD_ID });
  const top = view.topCard;
  return (
    <div
      ref={setNodeRef}
      className={`relative flex size-36 items-center justify-center rounded-full transition ${
        isOver ? "scale-110" : highlight ? "scale-105" : ""
      }`}
      // The pile glows in the current color, brighter while a card is dragged over it.
      style={{
        background: `radial-gradient(circle, ${UNO_HEX[view.currentColor]}${isOver ? "cc" : "66"} 0%, transparent 70%)`,
      }}
      data-testid="top-card"
    >
      <span
        className="absolute size-28 rotate-12 rounded-2xl border-[3px] border-ink/40 bg-white/40"
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
          <UnoCardView card={top} size="lg" layoutId={top.id} />
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
  const n = hand.length;
  // Fan the cards in an arc; the more cards, the tighter they overlap.
  const spread = Math.min(7, 50 / Math.max(n, 1));
  const [width, setWidth] = useState(0);
  const measure = useCallback((node: HTMLDivElement | null) => {
    // Without ResizeObserver (very old web views, test DOMs) the default overlap is used.
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // Overlap just enough to fit, but always leave a strip of each card visible to tap; if even
  // that doesn't fit, the hand scrolls sideways.
  const needed = n > 1 && width > 0 ? (CARD_WIDTH * n - width) / (n - 1) : 0;
  const overlap = Math.min(CARD_WIDTH - MIN_VISIBLE, Math.max(12, needed));
  return (
    <div ref={measure} className="flex w-full justify-center-safe overflow-x-auto px-6 pt-3 pb-2">
      <AnimatePresence initial={false}>
        {hand.map((card, i) => {
          const offset = i - (n - 1) / 2;
          return (
            <HandCard
              key={card.id}
              card={card}
              playable={playable.has(card.id)}
              dimmed={myTurn && !playable.has(card.id)}
              hidden={card.id === draggingId}
              rotate={offset * spread}
              lift={Math.abs(offset) ** 1.6 * 1.6}
              marginLeft={i === 0 ? 0 : -overlap}
              onPlay={onPlay}
            />
          );
        })}
      </AnimatePresence>
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
      {...listeners}
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
