import { MONOPOLY_DEAL_BOT_LEVELS } from "@cardhub/bots";
import { monopolyDeal } from "@cardhub/engine";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuthStore } from "../../account/authStore";
import { Button } from "../../components/Button";
import { newSeat, SeatEditor, seatsAreValid } from "../../components/SeatEditor";
import { TopBar } from "../../components/TopBar";
import { readDebugParams } from "../../lib/random";
import type { Seat } from "./localGame";
import { useDealStore } from "./store";

export function MonopolyDealSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lastSetup, start } = useDealStore();
  const [seats, setSeats] = useState<Seat[]>(
    () =>
      lastSetup?.seats ?? [
        newSeat<Seat>("human", useAuthStore.getState().account?.displayName ?? "You"),
        newSeat<Seat>("bot", "Bot 1"),
        newSeat<Seat>("bot", "Bot 2"),
      ],
  );
  const valid = seatsAreValid(seats, monopolyDeal.minPlayers, monopolyDeal.maxPlayers);

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
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-5 px-4 py-6">
      <TopBar back={{ to: "/", label: "Home" }} />
      <div>
        <h1 className="headline text-4xl font-bold">New Monopoly Deal game</h1>
        <p className="mt-2 font-bold text-white/90">
          Collect 3 complete property sets, each a different color, to win. Official 2024 rules.
        </p>
      </div>

      <SeatEditor
        seats={seats}
        onChange={setSeats}
        botLevels={MONOPOLY_DEAL_BOT_LEVELS}
        minPlayers={monopolyDeal.minPlayers}
        maxPlayers={monopolyDeal.maxPlayers}
      />

      <Button className="text-xl" disabled={!valid} onClick={onStart}>
        Start game
      </Button>
    </main>
  );
}
