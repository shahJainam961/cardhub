import { expect, test } from "@playwright/test";
import { expectDealGameOver, playDealUntilGameOver } from "./deal-helpers";

// Full games vary a lot in length, so allow more than the default 30s.
test.describe.configure({ timeout: 180_000 });

// A fixed seed makes the deal reproducible; botDelay=0 makes bots move instantly.
const SETUP_URL = "/monopoly-deal/new?seed=20260926&botDelay=0";

test("home opens Monopoly Deal setup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Play Monopoly Deal" }).click();
  await expect(page.getByRole("heading", { name: "New Monopoly Deal game" })).toBeVisible();
});

test("plays a full game against two bots and starts another", async ({ page }) => {
  await page.goto(SETUP_URL);
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByTestId("status")).toContainText("Your turn");
  await expect(page.getByLabel("Your hand").getByTestId("deal-card")).toHaveCount(7);

  await playDealUntilGameOver(page);
  await expectDealGameOver(page);

  await page.getByRole("button", { name: "Play again" }).click();
  await expect(page.getByTestId("status")).toBeVisible();
});

test("pass-and-play hides cards during every handoff", async ({ page }) => {
  await page.goto(SETUP_URL);
  await page.getByRole("combobox", { name: "Player 2 type" }).selectOption("human");
  await page.getByRole("textbox", { name: "Player 2 name" }).fill("Sam");
  await page.getByRole("button", { name: "Remove Bot 2" }).click();
  await page.getByRole("button", { name: "Start game" }).click();

  await expect(page.getByRole("dialog", { name: /^Pass the device to You/ })).toBeVisible();
  await expect(page.getByTestId("deal-card")).toHaveCount(0);
  await page.getByRole("button", { name: /show my cards/ }).click();
  await page.getByRole("button", { name: "End turn" }).click();
  // The first player ends with 7 cards, so no discard; the device goes to Sam.
  await expect(page.getByRole("dialog", { name: /^Pass the device to Sam/ })).toBeVisible();
  await expect(page.getByTestId("deal-card")).toHaveCount(0);

  await playDealUntilGameOver(page);
  await expectDealGameOver(page);
});

test("can watch a bots-only game to the end", async ({ page }) => {
  await page.goto(SETUP_URL);
  await page.getByRole("combobox", { name: "Player 1 type" }).selectOption("easy");
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByText("Watching the bots play")).toBeVisible();
  await expectDealGameOver(page);
});
