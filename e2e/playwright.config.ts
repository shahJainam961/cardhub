import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
/** Point at a deployed site (e.g. for post-release smoke tests); otherwise a local production build. */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:4173";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: "pnpm --filter @cardhub/web build && pnpm --filter @cardhub/web preview",
          url: baseURL,
          reuseExistingServer: !isCI,
          timeout: 120_000,
        },
      }),
});
