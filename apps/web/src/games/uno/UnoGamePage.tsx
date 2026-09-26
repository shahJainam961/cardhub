import { uno } from "@cardhub/engine";
import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Overlay } from "../../components/Overlay";
import { GameOverDialog, UnoTable } from "./components/UnoTable";
import { nextBotAction, pendingHandoff, seatOf, type LocalUnoGame } from "./localGame";
import { useUnoStore } from "./store";

export function UnoGamePage() {
  const game = useUnoStore((s) => s.game);
  if (!game) return <Navigate to="/uno/new" replace />;
  return <LocalUnoTable game={game} />;
}

/** A game on this device: pass-and-play humans and bots that move in the browser. */
function LocalUnoTable({ game }: { game: LocalUnoGame }) {
  const navigate = useNavigate();
  const { play, reveal, restart, error } = useUnoStore();

  const { state } = game;
  const result = uno.result(state);
  const handoff = pendingHandoff(game);
  // Nobody's hand is rendered during a handoff, so it cannot be seen through the overlay.
  const viewer = handoff ? null : game.revealedFor;
  const nameOf = (id: string) => seatOf(game, id).name;

  // Bots move on their own after a short delay; they wait while the device is being handed over.
  useEffect(() => {
    if (handoff) return;
    const action = nextBotAction(game);
    if (!action) return;
    const timer = setTimeout(() => play(action.player, action.move), game.botDelayMs);
    return () => clearTimeout(timer);
  }, [game, handoff, play]);

  // The game stays in memory (it is replaced by the next "Start game"), because clearing it
  // here would make this page redirect to setup before the navigation home completes.
  const leave = () => navigate("/");

  return (
    <UnoTable
      view={uno.playerView(state, viewer)}
      legalMoves={viewer ? uno.legalMoves(state, viewer) : []}
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
        <Overlay title={`Pass the device to ${nameOf(handoff)}`}>
          <p className="mb-4 text-white/70">Everyone else, look away!</p>
          <Button className="w-full" onClick={() => reveal(handoff)}>
            I&apos;m {nameOf(handoff)}, show my hand
          </Button>
        </Overlay>
      )}
      {result && (
        <GameOverDialog
          winnerName={nameOf(result.winners[0]!)}
          points={result.scores?.[result.winners[0]!] ?? 0}
        >
          <Button onClick={restart}>Play again</Button>
          <Button variant="secondary" onClick={() => navigate("/uno/new")}>
            Change setup
          </Button>
          <Button variant="secondary" onClick={leave}>
            Home
          </Button>
        </GameOverDialog>
      )}
    </UnoTable>
  );
}
