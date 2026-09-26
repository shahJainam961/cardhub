import {
  monopolyDeal,
  startGame,
  type DealCard,
  type MonopolyDealMove,
  type MonopolyDealState,
} from "@cardhub/engine";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DealTable } from "./DealTable";

const players = [
  { id: "me", name: "Me", isBot: false, connected: true },
  { id: "bot", name: "Bot", isBot: true, connected: true },
];

function renderTable(patch: (s: MonopolyDealState) => void) {
  const state = structuredClone(startGame(monopolyDeal, { players: ["me", "bot"], seed: 1 }));
  patch(state);
  const onMove = vi.fn<(move: MonopolyDealMove) => void>();
  render(
    <DealTable
      view={monopolyDeal.playerView(state, "me")}
      legalMoves={monopolyDeal.legalMoves(state, "me")}
      moveCount={0}
      log={[]}
      players={players}
      emptyHandMessage=""
      error={null}
      onMove={onMove}
      onLeave={() => {}}
    />,
  );
  return onMove;
}

const money = (id: string, value: number): DealCard => ({ id, kind: "money", value });

describe("DealTable", () => {
  it("offers what a card can do and plays the chosen option", async () => {
    const onMove = renderTable((s) => {
      s.hands.me = [money("m1", 3)];
    });
    expect(screen.getByTestId("status")).toHaveTextContent("Your turn · 3 plays left");
    await userEvent.click(screen.getByRole("button", { name: "3M" }));
    const sheet = screen.getByRole("dialog", { name: "3M" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Put in bank (3M)" }));
    expect(onMove).toHaveBeenCalledWith({ type: "bank", cardId: "m1" });
  });

  it("lets you choose payment cards and blocks unnecessary extras", async () => {
    const onMove = renderTable((s) => {
      s.currentIndex = 1;
      s.tables.me!.bank = [money("five", 5), money("one", 1)];
      s.pending = {
        kind: "debtCollector",
        actor: "bot",
        targets: ["me"],
        amount: 5,
        justSayNos: 0,
        paying: true,
      };
    });
    const dialog = screen.getByRole("dialog", { name: "Pay Bot 5M" });
    const pay = within(dialog).getByRole("button", { name: "Pay" });
    // The suggested payment (the 5M) is preselected and valid.
    expect(within(dialog).getByTestId("pay-total")).toHaveTextContent("Selected 5M of 5M");
    expect(pay).toBeEnabled();

    await userEvent.click(within(dialog).getByRole("button", { name: "1M" }));
    expect(pay).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("button", { name: "1M" }));
    await userEvent.click(pay);
    expect(onMove).toHaveBeenCalledWith({ type: "pay", cardIds: ["five"] });
  });

  it("asks whether to Just Say No to an action against you", async () => {
    const onMove = renderTable((s) => {
      s.currentIndex = 1;
      s.hands.me = [{ id: "jsn", kind: "action", action: "justSayNo", value: 4 }];
      s.tables.me!.bank = [money("m", 5)];
      s.pending = {
        kind: "debtCollector",
        actor: "bot",
        targets: ["me"],
        amount: 5,
        justSayNos: 0,
        paying: false,
      };
    });
    const dialog = screen.getByRole("dialog", { name: "Action against you" });
    expect(dialog).toHaveTextContent("Bot played Debt Collector (5M) on you.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Just Say No!" }));
    expect(onMove).toHaveBeenCalledWith({ type: "justSayNo", cardId: "jsn" });
  });

  it("makes you pick exactly the cards to discard", async () => {
    const onMove = renderTable((s) => {
      s.hands.me = Array.from({ length: 9 }, (_, i) => money(`c${i}`, 1));
      s.phase = "discard";
    });
    const dialog = screen.getByRole("dialog", { name: "Discard 2 cards" });
    const confirm = within(dialog).getByRole("button", { name: /Discard 0\/2/ });
    expect(confirm).toBeDisabled();
    const cards = within(dialog).getAllByRole("button", { name: "1M" });
    await userEvent.click(cards[0]!);
    await userEvent.click(cards[1]!);
    await userEvent.click(within(dialog).getByRole("button", { name: /Discard 2\/2/ }));
    expect(onMove).toHaveBeenCalledWith({ type: "discard", cardIds: ["c0", "c1"] });
  });
});
