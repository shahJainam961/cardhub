import { expect, type Locator, type Page } from "@playwright/test";

async function tryClick(locator: Locator): Promise<boolean> {
  try {
    await locator.click({ timeout: 1_000 });
    return true;
  } catch {
    return false;
  }
}

/** Focuses and presses Enter, if the element is ready soon. */
async function tryPress(locator: Locator): Promise<boolean> {
  try {
    await locator.press("Enter", { timeout: 1_000 });
    return true;
  } catch {
    return false;
  }
}

const GAME_OVER = /wins!$|^It's a draw$/;

/**
 * Plays Monopoly Deal for every human on this device until the game ends: handles handoffs,
 * accepts actions, pays with the suggested cards, discards, and otherwise plays the first option
 * of the first playable card before ending the turn.
 */
export async function playDealUntilGameOver(page: Page, timeoutMs = 160_000): Promise<void> {
  const gameOver = page.getByRole("dialog", { name: GAME_OVER });
  // A time budget, not a step count: in online games much of the time is spent waiting for others.
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await gameOver.isVisible()) return;

    const showCards = page.getByRole("button", { name: /show my cards/ });
    if (await showCards.isVisible()) {
      await tryClick(showCards);
      continue;
    }
    const respond = page.getByRole("dialog", { name: /^(Action against you|Just Say No!)$/ });
    if (await respond.isVisible()) {
      await tryClick(respond.getByRole("button", { name: /^Accept/ }));
      continue;
    }
    const pay = page.getByRole("dialog", { name: /^Pay .+ \d+M$/ });
    if (await pay.isVisible()) {
      await tryClick(pay.getByRole("button", { name: "Pay", exact: true }));
      continue;
    }
    const discard = page.getByRole("dialog", { name: /^Discard \d+ cards?$/ });
    if (await discard.isVisible()) {
      const needed = Number((await discard.getAttribute("aria-label"))!.match(/\d+/)![0]);
      const cards = discard.getByTestId("deal-card");
      for (let i = 0; i < needed; i++) await tryClick(cards.nth(i));
      await tryClick(discard.getByRole("button", { name: /^Discard \d+\/\d+$/ }));
      continue;
    }
    // Any open options sheet: take its first real option.
    const sheet = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("button", { name: "Cancel" }) });
    if (await sheet.isVisible()) {
      const options = sheet
        .getByRole("button")
        .filter({ hasNotText: /^Cancel$/ })
        .filter({ hasNot: page.getByTestId("deal-card") });
      if (!(await tryClick(options.first())))
        await tryClick(sheet.getByRole("button", { name: "Cancel" }));
      continue;
    }
    const playable = page.locator('[data-testid="deal-card"][data-active="true"]:enabled');
    if ((await playable.count()) > 0) {
      // The hand overlaps to fit the screen, so a card's center can be under its neighbor: use
      // the keyboard, which also checks the hand is keyboard-usable.
      await tryPress(playable.first());
      continue;
    }
    const endTurn = page.getByRole("button", { name: "End turn" });
    if (await endTurn.isVisible()) {
      await tryClick(endTurn);
      continue;
    }
    await page.waitForTimeout(25);
  }
  throw new Error(`Game did not finish within ${timeoutMs / 1000}s`);
}

export async function expectDealGameOver(page: Page): Promise<void> {
  await expect(page.getByRole("dialog", { name: GAME_OVER })).toBeVisible();
}
