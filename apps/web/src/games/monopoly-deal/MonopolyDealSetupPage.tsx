import { MONOPOLY_DEAL_BOT_LEVELS, type BotLevel } from "@cardhub/bots";
import { monopolyDeal } from "@cardhub/engine";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuthStore } from "../../account/authStore";
import { Button } from "../../components/Button";
import { readDebugParams } from "../../lib/random";
import type { Seat } from "./localGame";
import { useDealStore } from "./store";

let seatCounter = 0;
const newSeat = (kind: Seat["kind"], name: string, level: BotLevel = "normal"): Seat => ({
  id: `seat-${++seatCounter}`,
  name,
  kind,
  level,
});

export function MonopolyDealSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lastSetup, start } = useDealStore();
  const [seats, setSeats] = useState<Seat[]>(
    () =>
      lastSetup?.seats ?? [
        newSeat("human", useAuthStore.getState().account?.displayName ?? "You"),
        newSeat("bot", "Bot 1"),
        newSeat("bot", "Bot 2"),
      ],
  );

  const update = (id: string, patch: Partial<Seat>) =>
    setSeats((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addSeat = (kind: Seat["kind"]) => {
    const count = seats.filter((s) => s.kind === kind).length + 1;
    setSeats((all) => [...all, newSeat(kind, kind === "bot" ? `Bot ${count}` : `Player ${count}`)]);
  };

  const names = seats.map((s) => s.name.trim());
  const valid =
    seats.length >= monopolyDeal.minPlayers &&
    seats.length <= monopolyDeal.maxPlayers &&
    names.every((n) => n.length > 0) &&
    new Set(names).size === names.length;

  const onStart = () => {
    const { seed, botDelayMs } = readDebugParams(location.search);
    start({
      seats: seats.map((s) => ({ ...s, name: s.name.trim() })),
      ...(seed === undefined ? {} : { seed }),
      ...(botDelayMs === 0 ? { botSpeed: 0 } : {}),
    });
    navigate("/monopoly-deal/play");
  };

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black">New Monopoly Deal game</h1>
        <Link to="/" className="text-sm text-white/70 underline">
          Home
        </Link>
      </header>
      <p className="text-sm text-white/70">
        Collect 3 complete property sets, each a different color, to win. Official 2024 rules.
      </p>

      <section aria-labelledby="players-heading" className="flex flex-col gap-3">
        <h2 id="players-heading" className="text-lg font-bold">
          Players ({seats.length}/{monopolyDeal.maxPlayers})
        </h2>
        <ul className="flex flex-col gap-2">
          {seats.map((seat, index) => (
            <li
              key={seat.id}
              className="flex flex-wrap items-center gap-2 rounded-xl bg-felt-800 p-3"
            >
              <input
                className="min-h-11 min-w-0 flex-1 rounded-lg bg-black/30 px-3"
                value={seat.name}
                maxLength={20}
                aria-label={`Player ${index + 1} name`}
                onChange={(e) => update(seat.id, { name: e.target.value })}
              />
              <select
                className="min-h-11 rounded-lg bg-black/30 px-2"
                aria-label={`Player ${index + 1} type`}
                value={seat.kind === "human" ? "human" : seat.level}
                onChange={(e) =>
                  update(
                    seat.id,
                    e.target.value === "human"
                      ? { kind: "human" }
                      : { kind: "bot", level: e.target.value as BotLevel },
                  )
                }
              >
                <option value="human">Human</option>
                {MONOPOLY_DEAL_BOT_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    Bot ({level})
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                aria-label={`Remove ${seat.name || `player ${index + 1}`}`}
                disabled={seats.length <= monopolyDeal.minPlayers}
                onClick={() => setSeats((all) => all.filter((s) => s.id !== seat.id))}
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={seats.length >= monopolyDeal.maxPlayers}
            onClick={() => addSeat("human")}
          >
            + Human
          </Button>
          <Button
            variant="secondary"
            disabled={seats.length >= monopolyDeal.maxPlayers}
            onClick={() => addSeat("bot")}
          >
            + Bot
          </Button>
        </div>
        {!valid && (
          <p className="text-sm text-amber-300">Every player needs a different, non-empty name.</p>
        )}
      </section>

      <Button className="text-lg" disabled={!valid} onClick={onStart}>
        Start game
      </Button>
    </main>
  );
}
