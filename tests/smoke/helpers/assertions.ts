import { expect, type Page, type Response } from "@playwright/test";

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
