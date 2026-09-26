import type { BotLevel } from "@cardhub/bots";
import type { ClientMessages, RoomSnapshot } from "@cardhub/shared";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { StoreApi, UseBoundStore } from "zustand";
import { Button } from "../components/Button";
import type { OnlineStore } from "./createOnlineStore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any game's snapshot/messages
export type AnySnapshot = RoomSnapshot<any, any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMessages = ClientMessages<any, any>;

/** What a game provides to be playable online. */
export interface OnlineGameConfig<Snapshot extends AnySnapshot, Messages extends AnyMessages> {
  /** Display name, e.g. "Uno". */
  title: string;
  /** Route prefix, e.g. "/uno" (pages live at `${basePath}/online` and `${basePath}/room/:code`). */
  basePath: string;
  useStore: UseBoundStore<StoreApi<OnlineStore<Snapshot, Messages>>>;
  botLevels: readonly BotLevel[];
  maxPlayers: number;
  minPlayers: number;
}

interface OnlineRoomProps<Snapshot extends AnySnapshot, Messages extends AnyMessages> {
  config: OnlineGameConfig<Snapshot, Messages>;
  /** Extra lobby section, e.g. Uno's house rules. */
  lobbyExtras?: (snapshot: Snapshot, isHost: boolean) => ReactNode;
  renderTable: (snapshot: Snapshot, onLeave: () => void) => ReactNode;
}

export function OnlineRoom<Snapshot extends AnySnapshot, Messages extends AnyMessages>({
  config,
  lobbyExtras,
  renderTable,
}: OnlineRoomProps<Snapshot, Messages>) {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const { status, snapshot, error, joinRoom, leave } = config.useStore();

  // Join on arrival, which also covers shared links and page reloads. Only re-run when the code
  // in the URL changes, so leaving doesn't trigger a rejoin.
  useEffect(() => {
    void joinRoom(code);
  }, [code, joinRoom]);

  const onLeave = () => {
    void leave();
    navigate(`${config.basePath}/online`);
  };

  if (status === "error") {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-4 py-8">
        <h1 className="text-3xl font-black">Room {code.toUpperCase()}</h1>
        <p className="rounded-xl bg-red-600/90 p-3" role="alert">
          {error}
        </p>
        <Link to={`${config.basePath}/online`} className="text-white/80 underline">
          Back to online play
        </Link>
      </main>
    );
  }

  if (!snapshot || snapshot.code !== code.toUpperCase()) {
    return (
      <main className="flex min-h-full items-center justify-center px-4">
        <p className="text-white/80" role="status">
          Joining room {code.toUpperCase()}…
        </p>
      </main>
    );
  }

  return snapshot.phase === "lobby" ? (
    <Lobby config={config} snapshot={snapshot} onLeave={onLeave} extras={lobbyExtras} />
  ) : (
    renderTable(snapshot, onLeave)
  );
}

function Lobby<Snapshot extends AnySnapshot, Messages extends AnyMessages>({
  config,
  snapshot,
  onLeave,
  extras,
}: {
  config: OnlineGameConfig<Snapshot, Messages>;
  snapshot: Snapshot;
  onLeave(): void;
  extras: ((snapshot: Snapshot, isHost: boolean) => ReactNode) | undefined;
}) {
  const { send, notice } = config.useStore();
  const [botLevel, setBotLevel] = useState<BotLevel>("normal");
  const [copied, setCopied] = useState(false);
  const me = snapshot.seats.find((s) => s.id === snapshot.you);
  const isHost = me?.isHost ?? false;
  const full = snapshot.seats.length >= config.maxPlayers;

  const copyLink = async () => {
    await navigator.clipboard?.writeText(window.location.href).catch(() => {});
    setCopied(true);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={onLeave}>
          Leave
        </Button>
        <h1 className="text-xl font-bold">Online {config.title}</h1>
        <span className="w-16" />
      </header>

      <section className="flex flex-col items-center gap-2 rounded-2xl bg-felt-800 p-5 text-center">
        <p className="text-sm text-white/70">Room code</p>
        <p className="text-5xl font-black tracking-[0.3em]" data-testid="room-code">
          {snapshot.code}
        </p>
        <Button variant="secondary" onClick={() => void copyLink()}>
          {copied ? "Link copied" : "Copy invite link"}
        </Button>
      </section>

      {notice && (
        <p className="rounded-xl bg-red-600/90 p-3" role="alert">
          {notice}
        </p>
      )}

      <section aria-labelledby="seats-heading" className="flex flex-col gap-2">
        <h2 id="seats-heading" className="text-lg font-bold">
          Players ({snapshot.seats.length}/{config.maxPlayers})
        </h2>
        <ul className="flex flex-col gap-2">
          {snapshot.seats.map((seat) => (
            <li
              key={seat.id}
              className="flex items-center justify-between gap-2 rounded-xl bg-felt-800 p-3"
            >
              <span>
                <span className="font-semibold">{seat.name}</span>
                {seat.id === snapshot.you && (
                  <span className="ml-2 text-xs text-white/60">you</span>
                )}
                {seat.isHost && <span className="ml-2 text-xs text-amber-300">host</span>}
                {seat.kind === "bot" && (
                  <span className="ml-2 text-xs text-white/60">bot ({seat.level})</span>
                )}
                {!seat.connected && (
                  <span className="ml-2 text-xs text-amber-300">reconnecting…</span>
                )}
              </span>
              {isHost && seat.kind === "bot" && (
                <Button
                  variant="secondary"
                  aria-label={`Remove ${seat.name}`}
                  onClick={() => send("removeSeat", { seatId: seat.id })}
                >
                  ✕
                </Button>
              )}
            </li>
          ))}
        </ul>
        {isHost && (
          <div className="flex gap-2">
            <select
              className="min-h-11 rounded-lg bg-black/30 px-2"
              aria-label="Bot level"
              value={botLevel}
              onChange={(e) => setBotLevel(e.target.value as BotLevel)}
            >
              {config.botLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              disabled={full}
              onClick={() => send("addBot", { level: botLevel })}
            >
              + Bot
            </Button>
          </div>
        )}
      </section>

      {extras?.(snapshot, isHost)}

      {isHost ? (
        <Button
          className="text-lg"
          disabled={snapshot.seats.length < config.minPlayers}
          onClick={() => send("start", {})}
        >
          Start game
        </Button>
      ) : (
        <p className="text-center text-white/70">Waiting for the host to start the game…</p>
      )}
    </main>
  );
}
