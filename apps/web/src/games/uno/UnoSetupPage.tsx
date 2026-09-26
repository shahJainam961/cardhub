import { BOT_LEVELS, type BotLevel } from "@cardhub/bots";
import { uno, type UnoOptions } from "@cardhub/engine";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { readDebugParams } from "../../lib/random";
import type { Seat } from "./localGame";
import { useUnoStore } from "./store";

type VariantKey = "stacking" | "sevenZero" | "jumpIn" | "drawUntilPlayable";

const VARIANTS: { key: VariantKey; name: string; description: string }[] = [
  {
    key: "stacking",
    name: "Stacking",
    description: "Answer a +2 or +4 with another one; the next player draws the total.",
  },
  {
    key: "sevenZero",
    name: "7-0",
    description: "A 7 swaps hands with a player you choose; a 0 passes every hand along.",
  },
  {
    key: "jumpIn",
    name: "Jump-in",
    description: "Play an identical card out of turn; play continues from you.",
  },
  {
    key: "drawUntilPlayable",
    name: "Draw until playable",
    description: "Keep drawing until you get a card you can play.",
  },
];

let seatCounter = 0;
const newSeat = (kind: Seat["kind"], name: string, level: BotLevel = "normal"): Seat => ({
  id: `seat-${++seatCounter}`,
  name,
  kind,
  level,
});

const defaultSeats = () => [
  newSeat("human", "You"),
  newSeat("bot", "Bot 1"),
  newSeat("bot", "Bot 2"),
];

export function UnoSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lastSetup, start } = useUnoStore();
  const [seats, setSeats] = useState<Seat[]>(() => lastSetup?.seats ?? defaultSeats());
  const [options, setOptions] = useState<Partial<UnoOptions>>(() => lastSetup?.options ?? {});

  const update = (id: string, patch: Partial<Seat>) =>
    setSeats((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addSeat = (kind: Seat["kind"]) => {
    const count = seats.filter((s) => s.kind === kind).length + 1;
    setSeats((all) => [...all, newSeat(kind, kind === "bot" ? `Bot ${count}` : `Player ${count}`)]);
  };

  const names = seats.map((s) => s.name.trim());
  const valid =
    seats.length >= uno.minPlayers &&
    seats.length <= uno.maxPlayers &&
    names.every((n) => n.length > 0) &&
    new Set(names).size === names.length;

  const onStart = () => {
    start({
      seats: seats.map((s) => ({ ...s, name: s.name.trim() })),
      options,
      ...readDebugParams(location.search),
    });
    navigate("/uno/play");
  };

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black">New Uno game</h1>
        <Link to="/" className="text-sm text-white/70 underline">
          Home
        </Link>
      </header>

      <section aria-labelledby="players-heading" className="flex flex-col gap-3">
        <h2 id="players-heading" className="text-lg font-bold">
          Players ({seats.length}/{uno.maxPlayers})
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
                {BOT_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    Bot ({level})
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                aria-label={`Remove ${seat.name || `player ${index + 1}`}`}
                disabled={seats.length <= uno.minPlayers}
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
            disabled={seats.length >= uno.maxPlayers}
            onClick={() => addSeat("human")}
          >
            + Human
          </Button>
          <Button
            variant="secondary"
            disabled={seats.length >= uno.maxPlayers}
            onClick={() => addSeat("bot")}
          >
            + Bot
          </Button>
        </div>
        {!valid && (
          <p className="text-sm text-amber-300">Every player needs a different, non-empty name.</p>
        )}
      </section>

      <section aria-labelledby="variants-heading" className="flex flex-col gap-2">
        <h2 id="variants-heading" className="text-lg font-bold">
          House rules
        </h2>
        {VARIANTS.map((variant) => (
          <label key={variant.key} className="flex cursor-pointer gap-3 rounded-xl bg-felt-800 p-3">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-amber-400"
              checked={options[variant.key] ?? false}
              onChange={(e) => setOptions((o) => ({ ...o, [variant.key]: e.target.checked }))}
            />
            <span>
              <span className="font-semibold">{variant.name}</span>
              <span className="block text-sm text-white/70">{variant.description}</span>
            </span>
          </label>
        ))}
      </section>

      <Button className="text-lg" disabled={!valid} onClick={onStart}>
        Start game
      </Button>
    </main>
  );
}
