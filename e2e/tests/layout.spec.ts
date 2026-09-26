/// <reference lib="dom" />
import { expect, test, type Page } from "@playwright/test";

/** The whole table (seats, piles, your cards) fits the screen: nothing to scroll either way. */
async function expectNoScroll(page: Page) {
  // Polled: while a page slides in, it briefly sits a few pixels lower than its final place.
  await expect
    .poll(() =>
      page.evaluate(() => ({
        extraWidth: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        extraHeight: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      })),
    )
    .toEqual({ extraWidth: 0, extraHeight: 0 });
}

async function addBots(page: Page, total: number) {
  const seats = await page.getByRole("textbox", { name: /Player \d+ name/ }).count();
  for (let i = seats; i < total; i++) await page.getByRole("button", { name: "+ Bot" }).click();
}

for (const players of [3, 10]) {
  test(`an Uno table of ${players} fits the screen`, async ({ page }) => {
    await page.goto("/uno/new?seed=5&botDelay=100000");
    await addBots(page, players);
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(page.getByTestId("hand-card")).toHaveCount(7);
    await expect(page.getByRole("region", { name: "Table" }).getByRole("listitem")).toHaveCount(
      players - 1,
    );
    await expectNoScroll(page);
    // Every card in the hand is on screen.
    for (const card of await page.getByTestId("hand-card").all())
      await expect(card).toBeInViewport();
  });
}

for (const players of [3, 5]) {
  test(`a Monopoly Deal table of ${players} fits the screen`, async ({ page }) => {
    await page.goto("/monopoly-deal/new?seed=3&botDelay=100000");
    await addBots(page, players);
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(page.getByLabel("Your hand").getByTestId("deal-card")).not.toHaveCount(0);
    await expectNoScroll(page);
    await expect(page.getByLabel("Your area").getByTestId("bank-total")).toBeInViewport();
    for (const card of await page.getByLabel("Your hand").getByTestId("deal-card").all()) {
      await expect(card).toBeInViewport();
    }
  });
}
