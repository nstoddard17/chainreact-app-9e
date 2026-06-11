import { defineConfig, devices } from "@playwright/test";
import { baseUrl, STORAGE_STATE } from "./tests/smoke/helpers/env";

/**
 * Production smoke configuration — DISTINCT from the local e2e config
 * (`playwright.config.ts`).
 *
 * Differences from the e2e config, by design:
 *   - NO `webServer`: the suite runs against a deployed origin
 *     (PRODUCTION_SMOKE_BASE_URL, default https://chainreact.app), never a
 *     locally-spawned dev server.
 *   - NO `globalSetup` / provider mock servers: production smoke touches the
 *     real app only. No provider testing happens here.
 *   - `workers: 1`: keep load on production light and the run deterministic.
 *
 * Run with: `npm run smoke:prod`
 *
 * Projects:
 *   - `public`        — unauthenticated checks; always run (no credentials needed).
 *   - `auth-setup`    — signs in once, caches storage state. When credentials are
 *                       absent it writes an empty state and skips (not fails), so
 *                       the dependent project still resolves but self-skips.
 *   - `authenticated` — depends on `auth-setup`; reuses the cached session.
 */
export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/smoke", open: "never" }],
    ["./tests/smoke/smokeReporter.ts"],
  ],
  use: {
    baseURL: baseUrl(),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "public",
      testMatch: /public\.smoke\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "authenticated",
      testMatch: /(authenticated-shell|builder|slack-action)\.smoke\.spec\.ts$/,
      dependencies: ["auth-setup"],
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
    },
  ],
});
