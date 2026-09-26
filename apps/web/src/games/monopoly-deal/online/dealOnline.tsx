import { MONOPOLY_DEAL_BOT_LEVELS } from "@cardhub/bots";
import { monopolyDeal } from "@cardhub/engine";
import {
  MONOPOLY_DEAL_ROOM,
  type DealClientMessages,
  type DealRoomSnapshot,
} from "@cardhub/shared";
import { Button } from "../../../components/Button";
import { Overlay } from "../../../components/Overlay";
import { createOnlineStore } from "../../../online/createOnlineStore";
import { OnlinePage } from "../../../online/OnlinePage";
import { OnlineRoom, type OnlineGameConfig } from "../../../online/OnlineRoom";
import { DealTable } from "../components/DealTable";

export const useDealOnline = createOnlineStore<DealRoomSnapshot, DealClientMessages>(
  MONOPOLY_DEAL_ROOM,
);

const config: OnlineGameConfig<DealRoomSnapshot, DealClientMessages> = {
  title: "Monopoly Deal",
  basePath: "/monopoly-deal",
  useStore: useDealOnline,
  botLevels: MONOPOLY_DEAL_BOT_LEVELS,
  minPlayers: monopolyDeal.minPlayers,
  maxPlayers: monopolyDeal.maxPlayers,
};

export function DealOnlinePage() {
  return <OnlinePage config={config} />;
}

export function DealRoomPage() {
  return (
    <OnlineRoom
      config={config}
      lobbyExtras={() => (
        <p className="panel-soft p-4 text-center font-bold">
          Official 2024 rules: collect 3 complete sets of different colors.
        </p>
      )}
      renderTable={(snapshot, onLeave) => <DealOnlineTable snapshot={snapshot} onLeave={onLeave} />}
    />
  );
}

function DealOnlineTable({ snapshot, onLeave }: { snapshot: DealRoomSnapshot; onLeave(): void }) {
  const { send, notice, reconnecting } = useDealOnline();
  const nameOf = (id: string) => snapshot.seats.find((s) => s.id === id)?.name ?? "Someone";
  const isHost = snapshot.seats.find((s) => s.id === snapshot.you)?.isHost ?? false;
  const { result, view } = snapshot;
  if (!view) return null;

  return (
    <DealTable
      view={view}
      legalMoves={snapshot.legalMoves}
      moveCount={snapshot.moveCount}
      log={snapshot.log}
      players={snapshot.seats.map((s) => ({
        id: s.id,
        name: s.name,
        isBot: s.kind === "bot",
        connected: s.connected,
      }))}
      emptyHandMessage="Watching"
      error={reconnecting ? "Connection lost, reconnecting…" : notice}
      onMove={(move) => send("move", move)}
      onLeave={onLeave}
    >
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
            {isHost ? (
              <Button onClick={() => send("playAgain", {})}>Play again</Button>
            ) : (
              <p className="text-white/70">Waiting for the host to start another game…</p>
            )}
            <Button variant="secondary" onClick={onLeave}>
              Leave room
            </Button>
          </div>
        </Overlay>
      )}
    </DealTable>
  );
}
