import { expect, test } from "@playwright/test";
import { uniqueEmail, uniqueName, waitForCode } from "./supabase";

// These flows read sign-in codes from the local test inbox, so they only run locally / in CI.
test.skip(!!process.env.E2E_BASE_URL, "needs the local Supabase stack and its test inbox");

test("new visitors are signed in as guests automatically", async ({ page }) => {
  await page.goto("/");
  const badge = page.getByTestId("account-badge");
  await expect(badge).toContainText(/Guest \d{4}/);
  await expect(badge).toContainText("Guest");
});

test("a guest's new name is saved and used for their seat", async ({ page }) => {
  const name = uniqueName("Sam");
  await page.goto("/account");
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue(name);

  await page.goto("/");
  await expect(page.getByTestId("account-badge")).toContainText(name);
  await page.getByRole("link", { name: "Play Uno" }).click();
  await expect(page.getByRole("textbox", { name: "Player 1 name" })).toHaveValue(name);
});

test("a guest links an email, keeps their account, and can sign in on another device", async ({
  page,
  browser,
}) => {
  const name = uniqueName("Ana");
  const email = uniqueEmail();

  await page.goto("/account");
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved.")).toBeVisible();

  const save = page.getByRole("region", { name: "Save your progress" });
  await save.getByLabel("Email").fill(email);
  await save.getByRole("button", { name: "Send code" }).click();
  await save.getByLabel(/6-digit code/).fill(await waitForCode(email, "link"));
  await save.getByRole("button", { name: "Confirm code" }).click();

  await expect(page.getByTestId("account-email")).toHaveText(email);
  await expect(page.getByLabel("Display name")).toHaveValue(name);
  await page.goto("/");
  await expect(page.getByTestId("account-badge")).toContainText("Saved");

  // A second browser context has no session, like a new phone.
  const otherDevice = await browser.newContext();
  const other = await otherDevice.newPage();
  await other.goto("/account");
  await expect(other.getByLabel("Display name")).toHaveValue(/Guest \d{4}/);
  const signIn = other.getByRole("region", { name: "Already have an account?" });
  await signIn.getByLabel("Email").fill(email);
  await signIn.getByRole("button", { name: "Send sign-in code" }).click();
  await signIn.getByLabel(/6-digit code/).fill(await waitForCode(email, "signIn"));
  await signIn.getByRole("button", { name: "Confirm code" }).click();

  await expect(other.getByLabel("Display name")).toHaveValue(name);
  await expect(other.getByTestId("account-email")).toHaveText(email);
  await otherDevice.close();
});

test("a wrong code shows a helpful error", async ({ page }) => {
  const email = uniqueEmail();
  await page.goto("/account");
  const save = page.getByRole("region", { name: "Save your progress" });
  await save.getByLabel("Email").fill(email);
  await save.getByRole("button", { name: "Send code" }).click();
  await waitForCode(email, "link");
  await save.getByLabel(/6-digit code/).fill("000000");
  await save.getByRole("button", { name: "Confirm code" }).click();
  await expect(page.getByRole("alert")).toContainText(/wrong or has expired/);
});

test("signing out of a saved account starts a fresh guest", async ({ page }) => {
  const email = uniqueEmail();
  await page.goto("/account");
  const save = page.getByRole("region", { name: "Save your progress" });
  await save.getByLabel("Email").fill(email);
  await save.getByRole("button", { name: "Send code" }).click();
  await save.getByLabel(/6-digit code/).fill(await waitForCode(email, "link"));
  await save.getByRole("button", { name: "Confirm code" }).click();
  await expect(page.getByTestId("account-email")).toHaveText(email);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("region", { name: "Save your progress" })).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveValue(/Guest \d{4}/);
});
