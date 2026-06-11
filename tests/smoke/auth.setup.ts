import fs from "node:fs";
import path from "node:path";
import { test as setup, expect } from "@playwright/test";
import {
  STORAGE_STATE,
  hasSmokeCredentials,
  smokeEmail,
  smokePassword,
} from "./helpers/env";

/**
 * Signs in once with PRODUCTION_SMOKE_EMAIL / PRODUCTION_SMOKE_PASSWORD and
 * caches the session to STORAGE_STATE so the authenticated specs reuse one
 * login (lighter on production than re-authenticating per spec).
 *
 * The file is ALWAYS written — even an empty (unauthenticated) state when
 * credentials are absent — so the dependent `authenticated` project can resolve
 * its `storageState` path. With no credentials this test SKIPS (does not fail),
 * which keeps dependent tests runnable; they self-skip via `hasSmokeCredentials`.
 */
setup("authenticate", async ({ page }) => {
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });

  if (!hasSmokeCredentials()) {
    fs.writeFileSync(
      STORAGE_STATE,
      JSON.stringify({ cookies: [], origins: [] }),
    );
    setup.skip(
      true,
      "PRODUCTION_SMOKE_EMAIL / PRODUCTION_SMOKE_PASSWORD not set — wrote empty storage state; authenticated smoke will skip.",
    );
    return;
  }

  await page.goto("/auth/sign-in", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', smokeEmail()!);
  await page.fill('input[name="password"]', smokePassword()!);
  // `exact` avoids matching the "Sign in with Google" button.
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // Successful password sign-in server-redirects to /workflows.
  await page.waitForURL(/\/workflows(\/|\?|$)/, { timeout: 30_000 });
  await expect(page.getByTestId("app-shell-root")).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
