import { expect, test } from "@playwright/test";
import { expectGameOver, playUntilGameOver } from "./uno-helpers";

// A fixed seed makes the deal reproducible; botDelay=0 makes bots move instantly.
const SETUP_URL = "/uno/new?seed=20260926&botDelay=0";

test("plays a full game against two bots and starts another", async ({ page }) => {
  await page.goto(SETUP_URL);
  await page.getByRole("button", { name: "Start game" }).click();

  await expect(page.getByTestId("hand-card")).toHaveCount(7);
  await expect(page.getByTestId("card-count-Bot 1")).toHaveText(/\d+ cards?/);

  await playUntilGameOver(page);
  await expectGameOver(page);

  await page.getByRole("button", { name: "Play again" }).click();
  await expect(page.getByRole("dialog", { name: /wins!$/ })).toBeHidden();
  await expect(page.getByTestId("hand-card")).toHaveCount(7);
});

test("plays a full game with every house rule on", async ({ page }) => {
  await page.goto(SETUP_URL);
  for (const rule of ["Stacking", "7-0", "Jump-in", "Draw until playable"]) {
    await page.getByRole("checkbox", { name: new RegExp(rule) }).check();
  }
  await page.getByRole("button", { name: "Start game" }).click();

  await playUntilGameOver(page);
  await expectGameOver(page);
});

test("pass-and-play hides each hand until the next player confirms", async ({ page }) => {
  await page.goto(SETUP_URL);
  await page.getByRole("combobox", { name: "Player 2 type" }).selectOption("human");
  await page.getByRole("textbox", { name: "Player 2 name" }).fill("Sam");
  await page.getByRole("button", { name: "Remove Bot 2" }).click();
  await page.getByRole("button", { name: "Start game" }).click();

  const handoff = page.getByRole("dialog", { name: "Pass the device to You" });
  await expect(handoff).toBeVisible();
  await expect(page.getByTestId("hand-card")).toHaveCount(0);
  await handoff.getByRole("button", { name: /show my hand/ }).click();
  await expect(page.getByTestId("status")).toHaveText(/Your turn|Play the card you drew/);

  await page.getByRole("button", { name: "Draw a card" }).click();
  const pass = page.getByRole("button", { name: "Pass" });
  if (await pass.isVisible()) await pass.click();
  await expect(page.getByRole("dialog", { name: "Pass the device to Sam" })).toBeVisible();
  // The previous player's cards must not be on the page behind the handoff screen.
  await expect(page.getByTestId("hand-card")).toHaveCount(0);

  await playUntilGameOver(page);
  await expectGameOver(page);
});

test("can watch a bots-only game to the end", async ({ page }) => {
  await page.goto(SETUP_URL);
  await page.getByRole("combobox", { name: "Player 1 type" }).selectOption("easy");
  await page.getByRole("button", { name: "Start game" }).click();

  await expect(page.getByText("Watching the bots play")).toBeVisible();
  await expectGameOver(page);
});

test("leaving and refreshing mid-game return to safe screens", async ({ page }) => {
  await page.goto(SETUP_URL);
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByTestId("status")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "New Uno game" })).toBeVisible();

  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page.getByRole("heading", { name: "cardhub" })).toBeVisible();
});
