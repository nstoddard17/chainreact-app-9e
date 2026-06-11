import { expect, type Locator, type Page, type Response } from "@playwright/test";

/**
 * Server-error markers that indicate a 500 / React Server Components render
 * failure rather than a normally-rendered page. Production Next.js surfaces
 * these strings on the error boundary / default 500 surface.
 */
const SERVER_ERROR_MARKERS = [
  "Application error: a server-side exception has occurred",
  "Internal Server Error",
  "500: This page",
  "This Serverless Function has crashed",
] as const;

/**
 * Navigate to a path and assert the HTTP response is not a server error.
 * Returns the navigation Response so callers can make further assertions.
 */
export async function gotoOk(page: Page, pathOrUrl: string): Promise<Response | null> {
  const res = await page.goto(pathOrUrl, { waitUntil: "domcontentloaded" });
  if (res) {
    expect(
      res.status(),
      `Expected non-5xx status navigating to ${pathOrUrl}, got ${res.status()}`,
    ).toBeLessThan(500);
  }
  return res;
}

/**
 * Assert the rendered page is not a server-error / RSC-crash surface. Cheap
 * content check used on every public page so a 500 regression fails loudly
 * instead of silently passing a "page loaded" assertion.
 */
export async function assertNoServerError(page: Page): Promise<void> {
  const body = (await page.locator("body").innerText().catch(() => "")) ?? "";
  for (const marker of SERVER_ERROR_MARKERS) {
    expect(body, `Page shows server-error marker: "${marker}"`).not.toContain(marker);
  }
}

/**
 * Click `trigger` and wait for `revealed` to appear, retrying the click if
 * nothing happened.
 *
 * Client `onClick` handlers aren't wired until React hydrates; a click fired in
 * the window between `domcontentloaded` and hydration is silently dropped (the
 * DOM element exists, but no listener is attached yet). Plain `.click()` +
 * `toBeVisible()` then fails because the first click was a no-op. Retrying until
 * the post-condition holds makes the interaction resilient without touching
 * product behavior. Idempotent: once `revealed` is visible we stop before
 * re-clicking a now-covered trigger.
 */
export async function clickToReveal(
  trigger: Locator,
  revealed: Locator,
  opts: { timeout?: number } = {},
): Promise<void> {
  await expect(async () => {
    if (await revealed.isVisible().catch(() => false)) return;
    await trigger.click({ timeout: 2_000 });
    await expect(revealed).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: opts.timeout ?? 25_000, intervals: [400, 800, 1200, 2000] });
}
