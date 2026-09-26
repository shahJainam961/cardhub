import { defineConfig, devices } from "@playwright/test";

// Reuse the web app's Supabase settings (written by `pnpm db:env`) for account and database tests.
try {
  process.loadEnvFile("../apps/web/.env.local");
} catch {
  // No local Supabase configured; tests that need it will fail with a clear message.
}

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
    // Full games run with the OS "reduce motion" setting (which the app honors), so Playwright
    // doesn't wait on every animation; animations themselves are covered by motion.spec.ts.
    reducedMotion: "reduce",
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
        webServer: [
          {
            command: "pnpm --filter @cardhub/web build && pnpm --filter @cardhub/web preview",
            url: baseURL,
            reuseExistingServer: !isCI,
            timeout: 120_000,
          },
          {
            command: "pnpm --filter @cardhub/server start",
            port: 2567,
            reuseExistingServer: !isCI,
            timeout: 60_000,
          },
        ],
      }),
});
