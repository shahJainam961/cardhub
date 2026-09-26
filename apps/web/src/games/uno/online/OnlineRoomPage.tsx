import { BOT_LEVELS, type BotLevel } from "@cardhub/bots";
import type { UnoOptions } from "@cardhub/engine";
import type { UnoRoomSnapshot } from "@cardhub/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "../../../components/Button";
import { HOUSE_RULES } from "../houseRules";
import { GameOverDialog, UnoTable } from "../components/UnoTable";
import { useOnlineStore } from "./onlineStore";

export function OnlineRoomPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const { status, snapshot, error, joinRoom, leave } = useOnlineStore();

  // Join on arrival, which also covers shared links and page reloads. Only re-run when the code
  // in the URL changes, so leaving doesn't trigger a rejoin.
  useEffect(() => {
    void joinRoom(code);
  }, [code, joinRoom]);

  const onLeave = () => {
    void leave();
    navigate("/uno/online");
  };

  if (status === "error") {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-4 py-8">
        <h1 className="text-3xl font-black">Room {code.toUpperCase()}</h1>
        <p className="rounded-xl bg-red-600/90 p-3" role="alert">
          {error}
        </p>
        <Link to="/uno/online" className="text-white/80 underline">
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
    <Lobby snapshot={snapshot} onLeave={onLeave} />
  ) : (
    <OnlineTable snapshot={snapshot} onLeave={onLeave} />
  );
}

function Lobby({ snapshot, onLeave }: { snapshot: UnoRoomSnapshot; onLeave(): void }) {
  const { send, notice } = useOnlineStore();
  const [botLevel, setBotLevel] = useState<BotLevel>("normal");
  const [copied, setCopied] = useState(false);
  const me = snapshot.seats.find((s) => s.id === snapshot.you);
  const isHost = me?.isHost ?? false;
  const full = snapshot.seats.length >= 10;

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
        <h1 className="text-xl font-bold">Online Uno</h1>
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
          Players ({snapshot.seats.length}/10)
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
              {BOT_LEVELS.map((level) => (
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

      {isHost ? (
        <Button
          className="text-lg"
          disabled={snapshot.seats.length < 2}
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

function OnlineTable({ snapshot, onLeave }: { snapshot: UnoRoomSnapshot; onLeave(): void }) {
  const { send, notice, reconnecting } = useOnlineStore();
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
