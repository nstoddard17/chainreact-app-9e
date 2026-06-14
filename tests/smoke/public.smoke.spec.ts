import { test, expect } from "@playwright/test";
import { assertNoServerError, gotoOk } from "./helpers/assertions";

/**
 * Public smoke — runs with NO credentials. Verifies the unauthenticated
 * surfaces load, the auth pages are reachable, recovery routes behave safely,
 * and protected routes redirect to sign-in. Every page also asserts the absence
 * of a 500 / RSC-crash marker.
 */
test.describe("Public smoke", () => {
  test("homepage loads", async ({ page }) => {
    await gotoOk(page, "/");
    await expect(page.getByTestId("marketing-home")).toBeVisible();
    await assertNoServerError(page);
  });

  test("/auth/sign-in loads", async ({ page }) => {
    await gotoOk(page, "/auth/sign-in");
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await assertNoServerError(page);
  });

  test("/auth/sign-up loads", async ({ page }) => {
    await gotoOk(page, "/auth/sign-up");
    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();
    await assertNoServerError(page);
  });

  test("/auth/forgot-password loads", async ({ page }) => {
    await gotoOk(page, "/auth/forgot-password");
    await expect(
      page.getByRole("heading", { name: "Reset your password" }),
    ).toBeVisible();
    await assertNoServerError(page);
  });

  test("/auth/confirmed loads", async ({ page }) => {
    await gotoOk(page, "/auth/confirmed");
    await expect(
      page.getByRole("heading", { name: "Email confirmed" }),
    ).toBeVisible();
    await expect(page.getByTestId("confirmed-cta")).toBeVisible();
    await assertNoServerError(page);
  });

  test("/auth/reset-password without a recovery session redirects safely", async ({
    page,
  }) => {
    await gotoOk(page, "/auth/reset-password");
    // No recovery session → server bounces to forgot-password with a message,
    // never a broken form or a crash.
    await expect(page).toHaveURL(/\/auth\/forgot-password/);
    await expect(
      page.getByRole("heading", { name: "Reset your password" }),
    ).toBeVisible();
    await assertNoServerError(page);
  });

  for (const route of [
    "/workflows",
    "/runs",
    "/templates",
    "/apps",
    "/account",
    "/team",
  ]) {
    test(`protected route ${route} redirects to /auth/sign-in`, async ({
      page,
    }) => {
      await gotoOk(page, route);
      await expect(page).toHaveURL(/\/auth\/sign-in/);
      await expect(
        page.getByRole("heading", { name: "Sign in", exact: true }),
      ).toBeVisible();
      await assertNoServerError(page);
    });
  }
});
