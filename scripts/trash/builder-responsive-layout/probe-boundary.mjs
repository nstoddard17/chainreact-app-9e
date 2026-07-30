import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3218";
const browser = await chromium.launch();
const page = await browser.newPage();

for (const w of [1440, 1280, 1024, 900, 899, 820]) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto(`${BASE}/start`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="builder-shell"]', { timeout: 60000 });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    docClientWidth: document.documentElement.clientWidth,
    bodyClientWidth: document.body.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    mq1280: window.matchMedia("(min-width: 1280px)").matches,
    mqMed: window.matchMedia("(min-width: 900px) and (max-width: 1279.99px)").matches,
    mqNarrow: window.matchMedia("(max-width: 899.99px)").matches,
    mq1280exact: window.matchMedia("(width: 1280px)").matches,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
  }));
  const density = await page
    .locator('[data-testid="builder-header"]')
    .getAttribute("data-density");
  const railPres = await page
    .locator('[data-testid="builder-left-agent-rail"]')
    .getAttribute("data-presentation");
  const collapsed = await page
    .locator('[data-testid="builder-left-agent-rail"]')
    .getAttribute("data-collapsed");
  const scrim = await page.locator('[data-testid="builder-overlay-scrim"]').count();
  console.log(
    `vp=${w} inner=${m.innerWidth} docClient=${m.docClientWidth} ` +
      `mq1280=${m.mq1280} mqMed=${m.mqMed} mqNarrow=${m.mqNarrow} ` +
      `| density=${density} rail=${railPres} collapsed=${collapsed} scrim=${scrim} ` +
      `| scrollH=${m.scrollHeight} clientH=${m.clientHeight} bodyOverflowY=${m.bodyOverflowY}`,
  );
}
await browser.close();
