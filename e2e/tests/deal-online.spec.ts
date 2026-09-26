import { expect, test, type Page } from "@playwright/test";
import { expectDealGameOver, playDealUntilGameOver } from "./deal-helpers";

test.skip(
  !!process.env.E2E_BASE_URL,
  "creates rooms on the game server; runs against local servers only",
);
test.describe.configure({ timeout: 180_000 });

async function hostRoom(page: Page, game: "monopoly-deal" | "uno"): Promise<string> {
  await page.goto(`/${game}/online?botDelay=0`);
  await page.getByRole("button", { name: "Create room" }).click();
  const code = page.getByTestId("room-code");
  await expect(code).toHaveText(/^[A-Z0-9]{5}$/);
  return (await code.textContent())!;
}

test("two players on different devices play a full Monopoly Deal game with a bot", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  const code = await hostRoom(host, "monopoly-deal");
  await expect(host.getByRole("heading", { name: "Online Monopoly Deal" })).toBeVisible();

  await guest.goto("/monopoly-deal/online");
  await guest.getByLabel("Join with a code").fill(code);
  await guest.getByRole("button", { name: "Join room" }).click();
  await expect(guest.getByText("Waiting for the host to start the game…")).toBeVisible();

  await host.getByRole("button", { name: "+ Bot" }).click();
  await expect(guest.getByRole("region", { name: /Players/ }).getByRole("listitem")).toHaveCount(3);
  await host.getByRole("button", { name: "Start game" }).click();

  // The first player drew 2 on top of the 5 dealt; everyone else holds 5.
  await expect(host.getByLabel("Your hand").getByTestId("deal-card")).toHaveCount(7);
  await expect(guest.getByLabel("Your hand").getByTestId("deal-card")).toHaveCount(5);

  await Promise.all([playDealUntilGameOver(host), playDealUntilGameOver(guest)]);
  await expectDealGameOver(host);
  await expectDealGameOver(guest);

  await hostContext.close();
  await guestContext.close();
});

test("a code for another game's room is refused", async ({ browser }) => {
  const unoContext = await browser.newContext();
  const unoCode = await hostRoom(await unoContext.newPage(), "uno");

  const page = await (await browser.newContext()).newPage();
  await page.goto(`/monopoly-deal/room/${unoCode}`);
  await expect(page.getByRole("alert")).toContainText("That code is for a different game.");
  await unoContext.close();
});
