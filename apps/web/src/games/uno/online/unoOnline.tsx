import { UNO_BOT_LEVELS } from "@cardhub/bots";
import { uno, type UnoOptions } from "@cardhub/engine";
import { UNO_ROOM, type UnoClientMessages, type UnoRoomSnapshot } from "@cardhub/shared";
import { Button } from "../../../components/Button";
import { RuleToggle } from "../../../components/RuleToggle";
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
    <section aria-labelledby="rules-heading" className="panel flex flex-col gap-2 p-5">
      <h2 id="rules-heading" className="text-2xl font-semibold">
        House rules
      </h2>
      {HOUSE_RULES.map((rule) => (
        <RuleToggle
          key={rule.key}
          name={rule.name}
          description={rule.description}
          checked={snapshot.options[rule.key]}
          disabled={!isHost}
          onChange={(checked) => send("setOptions", { [rule.key]: checked } as Partial<UnoOptions>)}
        />
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
