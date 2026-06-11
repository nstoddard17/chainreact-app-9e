import { test, expect } from "@playwright/test";
import { assertNoServerError, clickToReveal, gotoOk } from "./helpers/assertions";
import { hasSmokeCredentials } from "./helpers/env";

/**
 * Authenticated shell smoke — reuses the cached session from `auth.setup.ts`.
 * Skips cleanly (not fails) when credentials are absent. Verifies the core
 * authenticated surfaces render: dashboard, account switcher, account settings
 * + billing usage, runs, templates, apps.
 */
test.skip(
  !hasSmokeCredentials(),
  "PRODUCTION_SMOKE_EMAIL / PRODUCTION_SMOKE_PASSWORD not set — skipping authenticated shell smoke.",
);

test.describe("Authenticated shell smoke", () => {
  test("dashboard/workflows loads and account switcher is visible", async ({
    page,
  }) => {
    await gotoOk(page, "/workflows");
    await expect(page.getByTestId("app-shell-root")).toBeVisible();
    await expect(page.getByTestId("workflows-dashboard")).toBeVisible();
    await expect(page.getByTestId("account-switcher-trigger")).toBeVisible();
    await assertNoServerError(page);
  });

  test("account settings + plan/billing usage render used/limit, remaining, reset date", async ({
    page,
  }) => {
    await gotoOk(page, "/account");
    await expect(page.getByTestId("account-settings")).toBeVisible();

    // The section nav is a client onClick that switches React state — retry the
    // click through hydration until the billing section actually mounts.
    const billing = page.getByTestId("account-section-billing");
    await clickToReveal(page.getByTestId("account-nav-billing"), billing);

    // used / limit
    const usage = page.getByTestId("billing-usage");
    await expect(usage).toBeVisible();
    await expect(usage).toContainText("tasks");
    await expect(usage).toContainText("/");

    // remaining
    await expect(page.getByTestId("billing-usage-remaining")).toBeVisible();

    // reset date — surfaced as "… resets <date>" copy in the usage row.
    await expect(billing.getByText(/resets/i).first()).toBeVisible();

    await assertNoServerError(page);
  });

  test("runs page loads", async ({ page }) => {
    await gotoOk(page, "/runs");
    await expect(page.getByTestId("runs-dashboard")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Runs", exact: true })).toBeVisible();
    await assertNoServerError(page);
  });

  test("templates page loads", async ({ page }) => {
    await gotoOk(page, "/templates");
    await expect(page.getByTestId("templates-dashboard")).toBeVisible();
    await assertNoServerError(page);
  });

  test("apps page loads", async ({ page }) => {
    await gotoOk(page, "/apps");
    await expect(page.getByTestId("apps-dashboard")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Apps", exact: true })).toBeVisible();
    await assertNoServerError(page);
  });
});
