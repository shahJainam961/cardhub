import { expect, test } from "@playwright/test";

// These run with animations on, to check the animated, drag-and-drop paths.
test.use({ reducedMotion: "no-preference" });

test("dragging a card onto the discard pile plays it", async ({ page }) => {
  await page.goto("/uno/new?seed=5&botDelay=100000");
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByTestId("hand-card")).toHaveCount(7);
  await page.waitForTimeout(800); // let the deal animation settle

  const card = page.locator('[data-testid="hand-card"][data-playable="true"]').first();
  const label = await card.getAttribute("aria-label");
  const from = (await card.boundingBox())!;
  const pile = (await page.getByTestId("top-card").boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 3);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 30, { steps: 5 });
  await page.mouse.move(pile.x + pile.width / 2, pile.y + pile.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByTestId("hand-card")).toHaveCount(6);
  await expect(page.getByTestId("top-card").getByRole("img", { name: label! })).toBeVisible();
});

test("dropping a card anywhere else doesn't play it", async ({ page }) => {
  await page.goto("/uno/new?seed=5&botDelay=100000");
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByTestId("hand-card")).toHaveCount(7);
  await page.waitForTimeout(800);

  const card = page.locator('[data-testid="hand-card"][data-playable="true"]').first();
  const from = (await card.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 3);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 150, { steps: 10 });
  await page.mouse.move(20, 20, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByTestId("hand-card")).toHaveCount(7);
});
