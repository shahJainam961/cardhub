import type { BotLevel } from "@cardhub/bots";
import { AnimatePresence, motion } from "motion/react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";

export interface EditableSeat {
  id: string;
  name: string;
  kind: "human" | "bot";
  level: BotLevel;
}

let seatCounter = 0;
export function newSeat<S extends EditableSeat>(
  kind: S["kind"],
  name: string,
  level: BotLevel = "normal",
): S {
  return { id: `seat-${++seatCounter}`, name, kind, level } as S;
}

/** Player list for a local game: names, human or bot (with level), add and remove. */
export function SeatEditor<S extends EditableSeat>({
  seats,
  onChange,
  botLevels,
  minPlayers,
  maxPlayers,
}: {
  seats: S[];
  onChange(seats: S[]): void;
  botLevels: readonly BotLevel[];
  minPlayers: number;
  maxPlayers: number;
}) {
  const update = (id: string, patch: Partial<EditableSeat>) =>
    onChange(seats.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const add = (kind: EditableSeat["kind"]) => {
    const count = seats.filter((s) => s.kind === kind).length + 1;
    onChange([...seats, newSeat<S>(kind, kind === "bot" ? `Bot ${count}` : `Player ${count}`)]);
  };
  const names = seats.map((s) => s.name.trim());
  const valid = names.every((n) => n.length > 0) && new Set(names).size === names.length;

  return (
    <section aria-labelledby="players-heading" className="panel flex flex-col gap-3 p-5">
      <h2 id="players-heading" className="text-2xl font-semibold">
        Players ({seats.length}/{maxPlayers})
      </h2>
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {seats.map((seat, index) => (
            <motion.li
              key={seat.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-2xl bg-cloud p-2 sm:flex"
            >
              <Avatar name={seat.name || `Player ${index + 1}`} isBot={seat.kind === "bot"} />
              <input
                className="field min-w-0 flex-1"
                value={seat.name}
                maxLength={20}
                aria-label={`Player ${index + 1} name`}
                onChange={(e) => update(seat.id, { name: e.target.value })}
              />
              <select
                // Phones: its own row under the name; wider screens: inline before the remove button.
                className="field col-start-2 row-start-2 px-2 sm:order-3"
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
                {botLevels.map((level) => (
                  <option key={level} value={level}>
                    Bot ({level})
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                className="!min-h-11 !px-3 sm:order-4"
                aria-label={`Remove ${seat.name || `player ${index + 1}`}`}
                disabled={seats.length <= minPlayers}
                onClick={() => onChange(seats.filter((s) => s.id !== seat.id))}
              >
                ✕
              </Button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="flex gap-2">
        <Button variant="accent" disabled={seats.length >= maxPlayers} onClick={() => add("human")}>
          + Human
        </Button>
        <Button variant="accent" disabled={seats.length >= maxPlayers} onClick={() => add("bot")}>
          + Bot
        </Button>
      </div>
      {!valid && (
        <p className="text-sm font-bold text-cherry">
          Every player needs a different, non-empty name.
        </p>
      )}
    </section>
  );
}

/** Whether every seat has a distinct, non-empty name and the count is allowed. */
export function seatsAreValid(
  seats: EditableSeat[],
  minPlayers: number,
  maxPlayers: number,
): boolean {
  const names = seats.map((s) => s.name.trim());
  return (
    seats.length >= minPlayers &&
    seats.length <= maxPlayers &&
    names.every((n) => n.length > 0) &&
    new Set(names).size === names.length
  );
}
