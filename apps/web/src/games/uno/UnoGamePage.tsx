import {
  isWild,
  uno,
  UNO_COLORS,
  type PlayerId,
  type UnoCard,
  type UnoColor,
  type UnoMove,
} from "@cardhub/engine";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Overlay } from "../../components/Overlay";
import { COLOR_BG, UnoCardBack, UnoCardView } from "./components/UnoCardView";
import {
  currentPlayer,
  nextBotAction,
  pendingHandoff,
  seatOf,
  type LocalUnoGame,
} from "./localGame";
import { useUnoStore } from "./store";

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

type Choice = { cardId: string; step: "color" | "target"; moveCount: number };

export function UnoGamePage() {
  const game = useUnoStore((s) => s.game);
  if (!game) return <Navigate to="/uno/new" replace />;
  return <UnoTable game={game} />;
}

function UnoTable({ game }: { game: LocalUnoGame }) {
  const navigate = useNavigate();
  const { play, reveal, restart, error } = useUnoStore();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [unoCalledAt, setUnoCalledAt] = useState<number | null>(null);

  const { state } = game;
  const result = uno.result(state);
  const current = currentPlayer(state);
  const handoff = pendingHandoff(game);
  // Nobody's hand is rendered during a handoff, so it cannot be seen through the overlay.
  const viewer = handoff ? null : game.revealedFor;
  const view = uno.playerView(state, viewer);
  const legal = viewer ? uno.legalMoves(state, viewer) : [];
  const playable = new Set(legal.flatMap((m) => (m.type === "play" ? [m.cardId] : [])));
  const canDraw = legal.some((m) => m.type === "draw");
  const canPass = legal.some((m) => m.type === "pass");
  const unoCalled = unoCalledAt === game.moveCount;
  const activeChoice = choice?.moveCount === game.moveCount ? choice : null;
  const nameOf = (id: PlayerId) => seatOf(game, id).name;

  // Bots move on their own after a short delay; they wait while the device is being handed over.
  useEffect(() => {
    if (handoff) return;
    const action = nextBotAction(game);
    if (!action) return;
    const timer = setTimeout(() => play(action.player, action.move), game.botDelayMs);
    return () => clearTimeout(timer);
  }, [game, handoff, play]);

  const submit = (cardId: string, extra: { color?: UnoColor; target?: PlayerId } = {}) => {
    if (!viewer) return;
    const move: UnoMove = { type: "play", cardId, ...extra, ...(unoCalled ? { uno: true } : {}) };
    setChoice(null);
    play(viewer, move);
  };

  const onCardClick = (card: UnoCard) => {
    const needsTarget = legal.some((m) => m.type === "play" && m.cardId === card.id && m.target);
    if (isWild(card)) setChoice({ cardId: card.id, step: "color", moveCount: game.moveCount });
    else if (needsTarget) setChoice({ cardId: card.id, step: "target", moveCount: game.moveCount });
    else submit(card.id);
  };

  // The game stays in memory (it is replaced by the next "Start game"), because clearing it
  // here would make this page redirect to setup before the navigation home completes.
  const leave = () => navigate("/");

  let status: string;
  if (result) status = "Game over";
  else if (viewer === current && view.pendingDraw > 0)
    status = `Stack a draw card or take ${view.pendingDraw}`;
  else if (viewer === current && view.hasDrawn) status = "Play the card you drew, or pass";
  else if (viewer === current) status = "Your turn";
  else status = `${nameOf(current)}'s turn`;

  const opponents = view.players.filter((p) => p.id !== viewer);

  return (
    <main className="safe-area mx-auto flex h-full max-w-5xl flex-col gap-3 px-4 py-3">
      <header className="flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={leave}>
          Leave
        </Button>
        <p className="text-lg font-bold" role="status" data-testid="status">
          {status}
        </p>
        <span className="w-16" />
      </header>

      <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Players">
        {opponents.map((p) => (
          <li
            key={p.id}
            className={`flex min-w-28 shrink-0 flex-col rounded-xl px-3 py-2 ring-2 ${
              p.id === current ? "bg-amber-400/20 ring-amber-300" : "bg-felt-800 ring-transparent"
            }`}
          >
            <span className="truncate font-semibold">
              {nameOf(p.id)}
              {seatOf(game, p.id).kind === "bot" && (
                <span className="ml-1 text-xs text-white/60">bot</span>
              )}
            </span>
            <span className="text-sm text-white/70" data-testid={`card-count-${nameOf(p.id)}`}>
              {p.cardCount} {p.cardCount === 1 ? "card" : "cards"}
              {p.cardCount === 1 && <strong className="ml-1 text-amber-300">UNO!</strong>}
            </span>
          </li>
        ))}
      </ul>

      <section
        className="flex flex-1 flex-col items-center justify-center gap-4"
        aria-label="Table"
      >
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => viewer && play(viewer, { type: "draw" })}
            disabled={!canDraw}
            aria-label={view.pendingDraw > 0 ? `Draw ${view.pendingDraw} cards` : "Draw a card"}
            className="rounded-2xl enabled:cursor-pointer enabled:ring-4 enabled:ring-amber-300 disabled:opacity-80"
          >
            <UnoCardBack size="lg" />
          </button>
          <div data-testid="top-card">
            <UnoCardView card={view.topCard} size="lg" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
          <span className="flex items-center gap-2">
            Color
            <span
              className={`inline-block size-5 rounded-full ring-2 ring-white ${COLOR_BG[view.currentColor]}`}
              data-testid="current-color"
              aria-label={view.currentColor}
            />
          </span>
          <span aria-label={view.direction === 1 ? "Clockwise" : "Counter-clockwise"}>
            {view.direction === 1 ? "↻" : "↺"} {view.drawPileCount} in pile
          </span>
          {view.pendingDraw > 0 && (
            <strong className="rounded-full bg-red-600 px-3 py-1">
              +{view.pendingDraw} pending
            </strong>
          )}
        </div>
        <ol
          className="min-h-16 text-center text-sm text-white/80"
          aria-live="polite"
          data-testid="game-log"
        >
          {game.log.slice(-3).map((entry, i) => (
            <li key={`${game.moveCount}-${i}`}>{entry}</li>
          ))}
        </ol>
      </section>

      <section aria-label="Your hand" className="flex flex-col gap-3">
        {viewer ? (
          <>
            <div className="flex items-center justify-center gap-2">
              <span className="font-semibold">{nameOf(viewer)}</span>
              {view.hand.length === 2 && playable.size > 0 && (
                <Button
                  variant={unoCalled ? "danger" : "secondary"}
                  aria-pressed={unoCalled}
                  onClick={() => setUnoCalledAt(unoCalled ? null : game.moveCount)}
                >
                  UNO!
                </Button>
              )}
              {canPass && (
                <Button variant="secondary" onClick={() => play(viewer, { type: "pass" })}>
                  Pass
                </Button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto px-1 pt-4 pb-2 sm:flex-wrap sm:justify-center">
              {sortHand(view.hand).map((card) => (
                <UnoCardView
                  key={card.id}
                  card={card}
                  playable={playable.has(card.id)}
                  onClick={() => onCardClick(card)}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="pb-4 text-center text-white/70">
            {game.seats.some((s) => s.kind === "human")
              ? "Waiting for the next player"
              : "Watching the bots play"}
          </p>
        )}
      </section>

      {error && (
        <p className="fixed inset-x-4 bottom-4 rounded-xl bg-red-600 p-3 text-center" role="alert">
          {error}
        </p>
      )}

      {activeChoice?.step === "color" && (
        <Overlay title="Choose a color">
          <div className="grid grid-cols-2 gap-3">
            {UNO_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`min-h-16 cursor-pointer rounded-xl font-bold capitalize ${COLOR_BG[color]}`}
                onClick={() => submit(activeChoice.cardId, { color })}
              >
                {color}
              </button>
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
              <Button key={p.id} onClick={() => submit(activeChoice.cardId, { target: p.id })}>
                {nameOf(p.id)} ({p.cardCount} cards)
              </Button>
            ))}
          </div>
          <Button variant="secondary" className="mt-4 w-full" onClick={() => setChoice(null)}>
            Cancel
          </Button>
        </Overlay>
      )}

      {handoff && (
        <Overlay title={`Pass the device to ${nameOf(handoff)}`}>
          <p className="mb-4 text-white/70">Everyone else, look away!</p>
          <Button className="w-full" onClick={() => reveal(handoff)}>
            I&apos;m {nameOf(handoff)}, show my hand
          </Button>
        </Overlay>
      )}

      {result && (
        <Overlay title={`${nameOf(result.winners[0]!)} wins!`}>
          <p className="mb-4 text-white/70">
            Scored {result.scores?.[result.winners[0]!] ?? 0} points from the other hands.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={restart}>Play again</Button>
            <Button variant="secondary" onClick={() => navigate("/uno/new")}>
              Change setup
            </Button>
            <Button variant="secondary" onClick={leave}>
              Home
            </Button>
          </div>
        </Overlay>
      )}
    </main>
  );
}
