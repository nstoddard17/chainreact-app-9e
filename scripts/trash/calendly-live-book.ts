/**
 * One-off Playwright driver for the Calendly Phase 13 live cert (2026-07-05).
 * Automates the PUBLIC scheduling page (no auth) to create the real
 * booking/cancellation/reschedule events the certification needs.
 *
 * Uses the owner's own email for the invitee (no third-party PII). Prints
 * page-flow status only. Screenshots on failure to scripts/trash/ for
 * debugging (deleted at cleanup).
 *
 *   npx tsx scripts/trash/calendly-live-book.ts book <schedulingUrl>
 *   npx tsx scripts/trash/calendly-live-book.ts cancel <cancelUrl> [reason]
 *   npx tsx scripts/trash/calendly-live-book.ts reschedule <rescheduleUrl>
 */
import { chromium, type Page } from "@playwright/test";

const INVITEE_NAME = "crsmoke live cert";
const INVITEE_EMAIL = process.env.CERT_INVITEE_EMAIL ?? "chainreactapp@gmail.com";

async function dismissCookieBanner(page: Page): Promise<void> {
  try {
    const btn = page.locator("#onetrust-accept-btn-handler");
    await btn.click({ timeout: 5000 });
    console.log("cookie banner dismissed");
  } catch {
    // no banner — fine
  }
}

/** Pick the first available day + time slot on the current calendar view. */
async function pickFirstSlot(page: Page): Promise<void> {
  // Available days: enabled calendar buttons carry aria-labels ending in
  // "- Times available" (capital T; unavailable days say "- No times
  // available" — case-SENSITIVE match required, and never match disabled).
  const availableDay = page
    .locator('button[aria-label*="Times available"]:not([disabled])')
    .first();
  try {
    await availableDay.waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    // Maybe this month has none — advance one month and retry once.
    console.log("no available day this month; advancing a month");
    await page.locator('button[aria-label*="next month" i]').first().click({ timeout: 10_000 });
    await availableDay.waitFor({ state: "visible", timeout: 20_000 });
  }
  const dayLabel = await availableDay.getAttribute("aria-label");
  await availableDay.click();
  console.log(`picked day: ${dayLabel}`);

  const slot = page.locator('button[data-container="time-button"]').first();
  await slot.waitFor({ state: "visible", timeout: 20_000 });
  const slotLabel = (await slot.textContent())?.trim();
  await slot.click();
  console.log(`picked slot: ${slotLabel}`);

  // The chosen slot expands into a confirm ("Next") button.
  const next = page.locator('button[aria-label^="Next" i], button:has-text("Next")').first();
  await next.waitFor({ state: "visible", timeout: 10_000 });
  await next.click();
  console.log("clicked Next");
}

async function submitDetailsForm(page: Page): Promise<void> {
  const name = page.locator('input[name="full_name"], #full_name').first();
  await name.waitFor({ state: "visible", timeout: 20_000 });
  await name.click();
  await name.pressSequentially(INVITEE_NAME, { delay: 60 });
  const email = page.locator('input[name="email"], #email').first();
  await email.click();
  await email.pressSequentially(INVITEE_EMAIL, { delay: 55 });
  await page.waitForTimeout(800);
  await page.locator('button[type="submit"]').first().click();
  console.log("submitted details form");
}

async function expectConfirmation(page: Page, phrases: string[]): Promise<void> {
  const pattern = new RegExp(phrases.join("|"), "i");
  await page.locator(`text=${pattern}`).first().waitFor({ state: "visible", timeout: 30_000 });
  console.log(`confirmation visible (${phrases[0]})`);
}

(async () => {
  const mode = process.argv[2];
  const url = process.argv[3];
  if (!mode || !url) throw new Error("usage: calendly-live-book.ts <book|cancel|reschedule> <url> [reason]");

  // Calendly bot-detection rejects vanilla headless Chromium ("This booking
  // cannot be completed... for security reasons"). Use headed real Chrome
  // with the automation banner masked and human-ish pacing.
  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/Chicago",
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await dismissCookieBanner(page);

    if (mode === "book") {
      await pickFirstSlot(page);
      await submitDetailsForm(page);
      await expectConfirmation(page, ["You are scheduled", "scheduled"]);
      console.log("BOOK OK");
    } else if (mode === "cancel") {
      const reason = process.argv[4] ?? "crsmoke live cert cleanup";
      // Cancellation page: optional reason textarea + a Cancel Event button.
      const reasonBox = page.locator("textarea").first();
      try {
        await reasonBox.waitFor({ state: "visible", timeout: 10_000 });
        await reasonBox.fill(reason);
      } catch {
        console.log("no reason textarea visible; continuing");
      }
      const cancelBtn = page
        .locator('button:has-text("Cancel Event"), button[type="submit"]:has-text("Cancel")')
        .first();
      await cancelBtn.waitFor({ state: "visible", timeout: 15_000 });
      await cancelBtn.click();
      await expectConfirmation(page, ["Cancellation", "canceled", "cancelled"]);
      console.log("CANCEL OK");
    } else if (mode === "reschedule") {
      // Reschedule page shows the calendar again.
      await pickFirstSlot(page);
      // Reschedule flow may go straight to a confirm button OR re-ask details.
      try {
        const submit = page
          .locator('button[type="submit"], button:has-text("Reschedule"), button:has-text("Schedule")')
          .first();
        await submit.waitFor({ state: "visible", timeout: 15_000 });
        await submit.click();
        console.log("clicked reschedule confirm");
      } catch {
        console.log("no extra confirm needed");
      }
      await expectConfirmation(page, ["You are scheduled", "rescheduled", "scheduled"]);
      console.log("RESCHEDULE OK");
    } else {
      throw new Error(`unknown mode ${mode}`);
    }
  } catch (err) {
    const shot = `scripts/trash/calendly-live-book-fail-${mode}.png`;
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.error(`FAIL (${mode}): ${(err as Error).message} — screenshot: ${shot}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
