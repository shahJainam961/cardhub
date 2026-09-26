import { UNO_BOT_LEVELS } from "@cardhub/bots";
import { uno, type UnoOptions } from "@cardhub/engine";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuthStore } from "../../account/authStore";
import { Button } from "../../components/Button";
import { RuleToggle } from "../../components/RuleToggle";
import { newSeat, SeatEditor, seatsAreValid } from "../../components/SeatEditor";
import { TopBar } from "../../components/TopBar";
import { readDebugParams } from "../../lib/random";
import type { Seat } from "./localGame";
import { HOUSE_RULES } from "./houseRules";
import { useUnoStore } from "./store";

const defaultSeats = (myName: string): Seat[] => [
  newSeat<Seat>("human", myName),
  newSeat<Seat>("bot", "Bot 1"),
  newSeat<Seat>("bot", "Bot 2"),
];

export function UnoSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lastSetup, start } = useUnoStore();
  const [seats, setSeats] = useState<Seat[]>(
    () => lastSetup?.seats ?? defaultSeats(useAuthStore.getState().account?.displayName ?? "You"),
  );
  const [options, setOptions] = useState<Partial<UnoOptions>>(() => lastSetup?.options ?? {});
  const valid = seatsAreValid(seats, uno.minPlayers, uno.maxPlayers);

  const onStart = () => {
    start({
      seats: seats.map((s) => ({ ...s, name: s.name.trim() })),
      options,
      ...readDebugParams(location.search),
    });
    navigate("/uno/play");
  };

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-5 px-4 py-6">
      <TopBar back={{ to: "/", label: "Home" }} />
      <h1 className="headline text-4xl font-bold">New Uno game</h1>

      <SeatEditor
        seats={seats}
        onChange={setSeats}
        botLevels={UNO_BOT_LEVELS}
        minPlayers={uno.minPlayers}
        maxPlayers={uno.maxPlayers}
      />

      <section aria-labelledby="variants-heading" className="panel flex flex-col gap-2 p-5">
        <h2 id="variants-heading" className="text-2xl font-semibold">
          House rules
        </h2>
        {HOUSE_RULES.map((rule) => (
          <RuleToggle
            key={rule.key}
            name={rule.name}
            description={rule.description}
            checked={options[rule.key] ?? false}
            onChange={(checked) => setOptions((o) => ({ ...o, [rule.key]: checked }))}
          />
        ))}
      </section>

      <Button className="text-xl" disabled={!valid} onClick={onStart}>
        Start game
      </Button>
    </main>
  );
}
