import { expect, test, type Locator, type Page } from "@playwright/test";

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

test.describe("Monopoly Deal drag and drop", () => {
  /** Drags the hand card named `card` onto the element found by `target`. */
  async function drag(page: Page, card: string, target: Locator) {
    const source = page
      .getByLabel("Your hand")
      .getByRole("button", { name: card, exact: true })
      .first();
    // The hand can be below the fold on short screens: bring it (and the target above it) into view.
    await source.scrollIntoViewIfNeeded();
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 30, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
  }

  test.beforeEach(async ({ page }) => {
    // Seed 42 deals a hand with a 1M note and Pacific Avenue; bots never get a turn.
    await page.goto("/monopoly-deal/new?seed=42&botDelay=100000");
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(page.getByTestId("status")).toContainText("Your turn");
    await page.waitForTimeout(600);
  });

  test("drops money onto the bank and a property onto the properties area", async ({ page }) => {
    const area = page.getByLabel("Your area");
    await expect(area.getByTestId("bank-total")).toContainText("Bank 0M");

    await drag(page, "1M", area.getByLabel(/^Bank /));
    await expect(area.getByTestId("bank-total")).toContainText("Bank 1M");
    await expect(page.getByTestId("status")).toContainText("2 plays left");

    await drag(page, "Pacific Avenue", area.getByLabel("Properties"));
    await expect(area.getByTestId("set-green")).toBeVisible();
    await expect(page.getByTestId("status")).toContainText("1 play left");
  });

  test("ignores a drop on a zone that can't take the card", async ({ page }) => {
    const area = page.getByLabel("Your area");
    // Properties can't be banked.
    await drag(page, "Pacific Avenue", area.getByLabel(/^Bank /));
    await expect(page.getByTestId("status")).toContainText("3 plays left");
    await expect(area.getByTestId("set-green")).toHaveCount(0);
  });
});
