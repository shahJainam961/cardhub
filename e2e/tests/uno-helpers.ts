import { expect, type Locator, type Page } from "@playwright/test";

/** Clicks if the element becomes clickable soon; bots can change the table at any moment. */
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

/**
 * Plays for every human on this device until the game ends: handles handoffs, pickers,
 * calls UNO, plays the first playable card, otherwise draws or passes.
 */
export async function playUntilGameOver(page: Page, timeoutMs = 100_000): Promise<void> {
  const gameOver = page.getByRole("dialog", { name: /wins!$/ });
  // A time budget, not a step count: in online games much of the time is spent waiting for others.
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await gameOver.isVisible()) return;

    const showHand = page.getByRole("button", { name: /show my hand/ });
    if (await showHand.isVisible()) {
      await tryClick(showHand);
      continue;
    }
    const colorPicker = page.getByRole("dialog", { name: "Choose a color" });
    if (await colorPicker.isVisible()) {
      await tryClick(colorPicker.getByRole("button", { name: "red" }));
      continue;
    }
    const swapPicker = page.getByRole("dialog", { name: "Swap hands with" });
    if (await swapPicker.isVisible()) {
      await tryClick(swapPicker.getByRole("button").first());
      continue;
    }

    const playable = page.locator('[data-testid="hand-card"][data-playable="true"]');
    if ((await playable.count()) > 0) {
      const unoButton = page.getByRole("button", { name: "UNO!" });
      if (
        (await unoButton.isVisible()) &&
        (await unoButton.getAttribute("aria-pressed")) === "false"
      ) {
        await tryClick(unoButton);
      }
      // Hand cards are fanned (rotated and overlapping), so aiming a click at a point is
      // unreliable; play with the keyboard instead, which also checks the hand is keyboard-usable.
      await tryPress(playable.first());
      continue;
    }
    const draw = page.getByRole("button", { name: /^Draw/ });
    if (await draw.isEnabled()) {
      await tryClick(draw);
      continue;
    }
    const pass = page.getByRole("button", { name: "Pass" });
    if (await pass.isVisible()) {
      await tryClick(pass);
      continue;
    }
    await page.waitForTimeout(25);
  }
  throw new Error(`Game did not finish within ${timeoutMs / 1000}s`);
}

export async function expectGameOver(page: Page): Promise<void> {
  const gameOver = page.getByRole("dialog", { name: /wins!$/ });
  await expect(gameOver).toBeVisible();
  await expect(gameOver).toContainText(/Scored \d+ points/);
}
