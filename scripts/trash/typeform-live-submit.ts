// Submit ONE real response to the live cert form via the public form UI.
import { chromium } from "@playwright/test";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto("https://form.typeform.com/to/KRVNz1KP", { waitUntil: "domcontentloaded", timeout: 60000 });
    const input = page.locator('input[type="text"], textarea, [contenteditable="true"]').first();
    await input.waitFor({ timeout: 30000 });
    await input.fill("crsmoke live cert response 2026-07-04");
    const submit = page.locator('[data-qa="submit-button"], button:has-text("Submit")').first();
    await submit.waitFor({ timeout: 10000 });
    await submit.click();
    await page.waitForTimeout(6000);
    const bodyText = (await page.textContent("body")) ?? "";
    console.log("post-submit page text snippet:", bodyText.slice(0, 200).replace(/\s+/g, " "));
  } catch (err) {
    await page.screenshot({ path: "scripts/trash/typeform-submit-fail.png" }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
  console.log("SUBMITTED");
})().then(() => process.exit(0)).catch((e) => { console.error("FATAL", (e as Error).message); process.exit(1); });
