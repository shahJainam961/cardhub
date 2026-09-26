import { UNO_BOT_LEVELS } from "@cardhub/bots";
import { uno, type UnoOptions } from "@cardhub/engine";
import { UNO_ROOM, type UnoClientMessages, type UnoRoomSnapshot } from "@cardhub/shared";
import { Button } from "../../../components/Button";
import { createOnlineStore } from "../../../online/createOnlineStore";
import { OnlinePage } from "../../../online/OnlinePage";
import { OnlineRoom, type OnlineGameConfig } from "../../../online/OnlineRoom";
import { GameOverDialog, UnoTable } from "../components/UnoTable";
import { HOUSE_RULES } from "../houseRules";

export const useUnoOnline = createOnlineStore<UnoRoomSnapshot, UnoClientMessages>(UNO_ROOM);

const config: OnlineGameConfig<UnoRoomSnapshot, UnoClientMessages> = {
  title: "Uno",
  basePath: "/uno",
  useStore: useUnoOnline,
  botLevels: UNO_BOT_LEVELS,
  minPlayers: uno.minPlayers,
  maxPlayers: uno.maxPlayers,
};

export function UnoOnlinePage() {
  return <OnlinePage config={config} />;
}

export function UnoRoomPage() {
  return (
    <OnlineRoom
      config={config}
      lobbyExtras={(snapshot, isHost) => <HouseRules snapshot={snapshot} isHost={isHost} />}
      renderTable={(snapshot, onLeave) => <UnoOnlineTable snapshot={snapshot} onLeave={onLeave} />}
    />
  );
}

function HouseRules({ snapshot, isHost }: { snapshot: UnoRoomSnapshot; isHost: boolean }) {
  const send = useUnoOnline((s) => s.send);
  return (
    <section aria-labelledby="rules-heading" className="flex flex-col gap-2">
      <h2 id="rules-heading" className="text-lg font-bold">
        House rules
      </h2>
      {HOUSE_RULES.map((rule) => (
        <label key={rule.key} className="flex gap-3 rounded-xl bg-felt-800 p-3">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-amber-400"
            checked={snapshot.options[rule.key]}
            disabled={!isHost}
            onChange={(e) =>
              send("setOptions", { [rule.key]: e.target.checked } as Partial<UnoOptions>)
            }
          />
          <span>
            <span className="font-semibold">{rule.name}</span>
            <span className="block text-sm text-white/70">{rule.description}</span>
          </span>
        </label>
      ))}
    </section>
  );
}

function UnoOnlineTable({ snapshot, onLeave }: { snapshot: UnoRoomSnapshot; onLeave(): void }) {
  const { send, notice, reconnecting } = useUnoOnline();
  const nameOf = (id: string) => snapshot.seats.find((s) => s.id === id)?.name ?? "Someone";
  const isHost = snapshot.seats.find((s) => s.id === snapshot.you)?.isHost ?? false;
  const { result, view } = snapshot;
  if (!view) return null;

  return (
    <UnoTable
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
        <GameOverDialog
          winnerName={nameOf(result.winners[0]!)}
          points={result.scores?.[result.winners[0]!] ?? 0}
        >
          {isHost ? (
            <Button onClick={() => send("playAgain", {})}>Play again</Button>
          ) : (
            <p className="text-white/70">Waiting for the host to start another game…</p>
          )}
          <Button variant="secondary" onClick={onLeave}>
            Leave room
          </Button>
        </GameOverDialog>
      )}
    </UnoTable>
  );
}
