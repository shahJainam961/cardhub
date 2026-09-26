import { expect, test, type Page } from "@playwright/test";
import { expectGameOver, playUntilGameOver } from "./uno-helpers";

// Full games vary a lot in length with the shuffle, so allow more than the default 30s.
test.describe.configure({ timeout: 120_000 });

test.skip(
  !!process.env.E2E_BASE_URL,
  "creates rooms on the game server; runs against local servers only",
);

async function hostRoom(page: Page): Promise<string> {
  await page.goto("/uno/online?botDelay=0");
  await page.getByRole("button", { name: "Create room" }).click();
  const code = page.getByTestId("room-code");
  await expect(code).toHaveText(/^[A-Z0-9]{5}$/);
  return (await code.textContent())!;
}

async function joinByCode(page: Page, code: string) {
  await page.goto("/uno/online");
  await page.getByLabel("Join with a code").fill(code);
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByTestId("room-code")).toHaveText(code);
}

test("two players on different devices play a full game with a bot", async ({ browser }) => {
  // Separate browser contexts have separate guest accounts, like two phones.
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  const code = await hostRoom(host);
  await joinByCode(guest, code);

  const seats = host.getByRole("region", { name: /Players/ }).getByRole("listitem");
  await expect(seats).toHaveCount(2);
  await expect(guest.getByText("Waiting for the host to start the game…")).toBeVisible();

  await host.getByRole("button", { name: "+ Bot" }).click();
  // House rules reflect the server's state, so the box flips after a round trip.
  await host.getByRole("checkbox", { name: /Stacking/ }).click();
  await expect(host.getByRole("checkbox", { name: /Stacking/ })).toBeChecked();
  await expect(guest.getByRole("checkbox", { name: /Stacking/ })).toBeChecked();
  await expect(guest.getByRole("region", { name: /Players/ }).getByRole("listitem")).toHaveCount(3);

  await host.getByRole("button", { name: "Start game" }).click();
  await expect(host.getByTestId("hand-card")).toHaveCount(7);
  await expect(guest.getByTestId("hand-card")).toHaveCount(7);

  await Promise.all([playUntilGameOver(host), playUntilGameOver(guest)]);
  await expectGameOver(host);
  await expectGameOver(guest);
  await expect(guest.getByText("Waiting for the host to start another game…")).toBeVisible();

  await host.getByRole("button", { name: "Play again" }).click();
  await expect(guest.getByRole("dialog", { name: /wins!$/ })).toBeHidden();
  await expect(guest.getByTestId("hand-card")).toHaveCount(7);

  await hostContext.close();
  await guestContext.close();
});

test("reloading the page rejoins the same seat", async ({ page }) => {
  const code = await hostRoom(page);
  await page.getByRole("button", { name: "+ Bot" }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByTestId("hand-card")).not.toHaveCount(0);

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/uno/room/${code}$`));
  await expect(page.getByTestId("hand-card")).not.toHaveCount(0);
  await expect(page.getByTestId("status")).toBeVisible();
});

test("a wrong code explains the problem", async ({ page }) => {
  await page.goto("/uno/room/ZZZZZ");
  await expect(page.getByRole("alert")).toContainText(/No room with that code/);
  await page.getByRole("link", { name: "Back to online play" }).click();
  await expect(page.getByRole("heading", { name: "Play Uno online" })).toBeVisible();
});

test("latecomers can't join a game in progress", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const lateContext = await browser.newContext();
  const host = await hostContext.newPage();
  const code = await hostRoom(host);
  await host.getByRole("button", { name: "+ Bot" }).click();
  await host.getByRole("button", { name: "Start game" }).click();
  await expect(host.getByTestId("hand-card")).not.toHaveCount(0);

  const late = await lateContext.newPage();
  await late.goto(`/uno/room/${code}`);
  await expect(late.getByRole("alert")).toContainText(/already started/);
  await hostContext.close();
  await lateContext.close();
});
