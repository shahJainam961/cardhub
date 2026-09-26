import { expect, test } from "@playwright/test";

// Quick checks that the deployed site works end to end. They run after every release and daily
// (`pnpm test:smoke` with E2E_BASE_URL set), and locally against the dev stack too.
test.describe("@smoke", () => {
  // The free game server sleeps when idle and can take about a minute to wake up.
  test.describe.configure({ timeout: 180_000 });

  test("home page loads and signs in a guest", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "cardhub" })).toBeVisible();
    await expect(page.getByTestId("account-badge")).toContainText("Guest", { timeout: 30_000 });
  });

  test("a local game against bots starts", async ({ page }) => {
    await page.goto("/uno/new");
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(page.getByTestId("hand-card")).toHaveCount(7);
    await expect(page.getByTestId("status")).toBeVisible();
  });

  test("an online room can be created and played with a bot", async ({ page }) => {
    await page.goto("/uno/online");
    await page.getByRole("button", { name: "Create room" }).click();
    await expect(page.getByTestId("room-code")).toHaveText(/^[A-Z0-9]{5}$/, { timeout: 120_000 });

    await page.getByRole("button", { name: "+ Bot" }).click();
    await expect(page.getByText(/bot \(normal\)/)).toBeVisible();
    await page.getByRole("button", { name: "Start game" }).click();
    await expect(page.getByTestId("hand-card")).toHaveCount(7);

    await page.getByRole("button", { name: "Leave" }).click();
    await expect(page.getByRole("heading", { name: "Play Uno online" })).toBeVisible();
  });
});
