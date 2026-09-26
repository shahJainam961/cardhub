import { expect, test } from "@playwright/test";

test("home lists the games and opens Uno setup", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "cardhub" })).toBeVisible();
  await expect(page.getByText("Coming soon")).toHaveCount(2);

  await page.getByRole("link", { name: "Play Uno" }).click();
  await expect(page).toHaveURL(/\/uno\/new$/);
  await expect(page.getByRole("heading", { name: "New Uno game" })).toBeVisible();
});

test("unknown pages redirect home", async ({ page }) => {
  await page.goto("/does-not-exist");
  await expect(page.getByRole("heading", { name: "cardhub" })).toBeVisible();
});
