import { defineConfig, devices } from "@playwright/test";

/**
 * Backend-free Chromium config for the Analytics layout editor
 * (ANALYTICS-EXPLICIT-LAYOUT-S4-EDITOR-INTEGRATION-1).
 *
 * WHY A SEPARATE CONFIG. jsdom does not lay out CSS Grid and has no real
 * PointerEvent, so the two things only a browser can prove — that a rectangle
 * turns into the right pixels, and that a real pointer gesture behaves — had no
 * permanent coverage. The main `playwright.config.ts` cannot supply it: it runs
 * a `globalSetup` and boots the dev server against local Supabase, so a Supabase
 * outage means zero browser coverage of a purely client-side interaction.
 *
 * This config deliberately has:
 *   - NO globalSetup / globalTeardown
 *   - NO authentication and no storage state
 *   - NO Supabase, no Docker, no database
 *   - NO new public route — it drives the EXISTING `/dev-drag-harness` page,
 *     which is double-gated (404 in production unconditionally, and 404 outside
 *     production unless `E2E_DRAG_HARNESS=1`, set only here and by the e2e config).
 *
 * The harness mounts the REAL AnalyticsDashboard with in-memory fixture widgets
 * and issues no network request on mount, so everything measured here is the
 * shipping component.
 */

const PORT = Number(process.env.ANALYTICS_LAYOUT_PORT ?? 3123);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/browser/analytics",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      // Unlocks the harness route outside production. Nothing else is needed:
      // the page reads no cookies, calls no API and touches no database.
      E2E_DRAG_HARNESS: "1",
    },
  },
});
