import { monopolyDeal } from "@cardhub/engine";
import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Overlay } from "../../components/Overlay";
import { DealTable } from "./components/DealTable";
import {
  awaitingPlayer,
  nextBotAction,
  pendingHandoff,
  seatOf,
  type LocalDealGame,
} from "./localGame";
import { useDealStore } from "./store";

export function MonopolyDealGamePage() {
  const game = useDealStore((s) => s.game);
  if (!game) return <Navigate to="/monopoly-deal/new" replace />;
  return <LocalDealTable game={game} />;
}

function LocalDealTable({ game }: { game: LocalDealGame }) {
  const navigate = useNavigate();
  const { play, reveal, restart, error } = useDealStore();
  const { state } = game;
  const result = monopolyDeal.result(state);
  const handoff = pendingHandoff(game);
  // Nobody's cards are rendered during a handoff, so they can't be seen through the overlay.
  const viewer = handoff ? null : game.revealedFor;
  const awaiting = awaitingPlayer(game);
  const nameOf = (id: string) => seatOf(game, id).name;

  // Bots act after a human-like pause; they wait while the device is being handed over.
  useEffect(() => {
    if (handoff) return;
    const action = nextBotAction(game);
    if (!action) return;
    const timer = setTimeout(() => play(action.player, action.move), action.delayMs);
    return () => clearTimeout(timer);
  }, [game, handoff, play]);

  const leave = () => navigate("/");
  const handoffReason =
    handoff && handoff !== state.players[state.currentIndex] ? " to respond" : "";

  return (
    <DealTable
      view={monopolyDeal.playerView(state, viewer)}
      legalMoves={viewer && awaiting === viewer ? monopolyDeal.legalMoves(state, viewer) : []}
      moveCount={game.moveCount}
      log={game.log}
      players={game.seats.map((s) => ({
        id: s.id,
        name: s.name,
        isBot: s.kind === "bot",
        connected: true,
      }))}
      emptyHandMessage={
        game.seats.some((s) => s.kind === "human")
          ? "Waiting for the next player"
          : "Watching the bots play"
      }
      error={error}
      onMove={(move) => viewer && play(viewer, move)}
      onLeave={leave}
    >
      {handoff && (
        <Overlay title={`Pass the device to ${nameOf(handoff)}${handoffReason}`}>
          <p className="mb-4 text-white/70">Everyone else, look away!</p>
          <Button className="w-full" onClick={() => reveal(handoff)}>
            I&apos;m {nameOf(handoff)}, show my cards
          </Button>
        </Overlay>
      )}
      {result && (
        <Overlay
          title={result.outcome === "win" ? `${nameOf(result.winners[0]!)} wins!` : "It's a draw"}
        >
          <p className="mb-4 text-white/70">
            {result.outcome === "win"
              ? "Three complete sets of different colors."
              : "No cards were left to play."}
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={restart}>Play again</Button>
            <Button variant="secondary" onClick={() => navigate("/monopoly-deal/new")}>
              Change setup
            </Button>
            <Button variant="secondary" onClick={leave}>
              Home
            </Button>
          </div>
        </Overlay>
      )}
    </DealTable>
  );
}
