import { render, screen, within } from "@testing-library/react";
import { uno } from "@cardhub/engine";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { cardLabel } from "./cardLabel";
import type { Seat } from "./localGame";
import { useUnoStore } from "./store";
import { UnoGamePage } from "./UnoGamePage";
import { UnoSetupPage } from "./UnoSetupPage";

const seats: Seat[] = [
  { id: "me", name: "Me", kind: "human", level: "normal" },
  { id: "friend", name: "Friend", kind: "human", level: "normal" },
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/uno/new" element={<UnoSetupPage />} />
        <Route path="/uno/play" element={<UnoGamePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useUnoStore.setState({ game: null, lastSetup: null, error: null });
});

describe("UnoGamePage", () => {
  it("redirects to setup when there is no game", () => {
    renderAt("/uno/play");
    expect(screen.getByRole("heading", { name: "New Uno game" })).toBeInTheDocument();
  });

  it("hides hands behind a handoff screen in pass-and-play", async () => {
    useUnoStore.getState().start({ seats, options: {}, seed: 7, botDelayMs: 0 });
    renderAt("/uno/play");

    const handoff = screen.getByRole("dialog", { name: "Pass the device to Me" });
    expect(screen.queryAllByTestId("hand-card")).toHaveLength(0);

    await userEvent.click(within(handoff).getByRole("button", { name: /show my hand/ }));
    expect(screen.getAllByTestId("hand-card")).toHaveLength(7);
    expect(screen.getByTestId("status")).toHaveTextContent("Your turn");
  });

  it("only enables legal cards and hands over after drawing", async () => {
    useUnoStore.getState().start({ seats, options: {}, seed: 7, botDelayMs: 0 });
    useUnoStore.getState().reveal("me");
    renderAt("/uno/play");

    const { state } = useUnoStore.getState().game!;
    const hand = state.hands.me!;
    const legalLabels = new Set(
      uno
        .legalMoves(state, "me")
        .flatMap((m) =>
          m.type === "play" ? [cardLabel(hand.find((c) => c.id === m.cardId)!)] : [],
        ),
    );
    const cards = screen.getAllByTestId("hand-card");
    expect(cards).toHaveLength(hand.length);
    for (const card of cards) {
      const isLegal = legalLabels.has(card.getAttribute("aria-label")!);
      expect(card.dataset.playable).toBe(String(isLegal));
      expect(card.hasAttribute("disabled")).toBe(!isLegal);
    }

    await userEvent.click(screen.getByRole("button", { name: "Draw a card" }));
    const pass = screen.queryByRole("button", { name: "Pass" });
    if (pass) await userEvent.click(pass);
    expect(screen.getByRole("dialog", { name: "Pass the device to Friend" })).toBeInTheDocument();
    expect(screen.queryAllByTestId("hand-card")).toHaveLength(0);
  });
});

describe("UnoSetupPage", () => {
  it("starts a game with the chosen players and house rules", async () => {
    renderAt("/uno/new");
    await userEvent.click(screen.getByRole("button", { name: "+ Bot" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Stacking/ }));
    await userEvent.click(screen.getByRole("button", { name: "Start game" }));

    const { game } = useUnoStore.getState();
    expect(game?.seats.map((s) => s.name)).toEqual(["You", "Bot 1", "Bot 2", "Bot 3"]);
    expect(game?.state.options.stacking).toBe(true);
    expect(screen.getByTestId("status")).toBeInTheDocument();
  });

  it("blocks starting with duplicate names", async () => {
    renderAt("/uno/new");
    const name = screen.getByRole("textbox", { name: "Player 2 name" });
    await userEvent.clear(name);
    await userEvent.type(name, "You");
    expect(screen.getByRole("button", { name: "Start game" })).toBeDisabled();
  });
});
