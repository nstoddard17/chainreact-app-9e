/**
 * RESPONSIVE-SETTINGS-3 — one-off probe. Loads a single emitted fragment at a
 * single width and prints the geometry of the deepest boxes, so a PASS from the
 * sweep can be checked against what the browser actually laid out rather than
 * trusted on its own.
 *
 *   node scripts/trash/responsive-settings/probe.mjs account-02-long-identity 360
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [name = "account-02-long-identity", widthArg = "360"] = process.argv.slice(2);
const width = Number(widthArg);
const HTML_DIR = join(process.cwd(), "owner-review", "html");
const css = readFileSync(join(HTML_DIR, "tailwind.css"), "utf8");
const fragment = readFileSync(join(HTML_DIR, `${name}.html`), "utf8");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width, height: 900 });
await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
   <style>html,body{margin:0;padding:0}body{overflow-x:auto}</style></head>
   <body class="bg-background text-foreground">
   <div data-app-surface="dark" class="flex min-h-screen"><div class="flex min-w-0 flex-1 flex-col">${fragment}</div></div>
   </body></html>`,
  { waitUntil: "load" },
);

const out = await page.evaluate(() => {
  const doc = document.documentElement;
  const rows = [];
  // EVERY element, not just the tagged regions: the point is to find containment
  // failures the tagged-region list would miss.
  for (const el of document.querySelectorAll("*")) {
    const parent = el.parentElement;
    if (!parent) continue;
    const c = el.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    if (c.width === 0) continue;
    const pos = getComputedStyle(el).position;
    if (pos === "fixed" || pos === "absolute") continue;
    const by = Math.max(c.right - p.right, p.left - c.left);
    if (by > 1) {
      rows.push({
        el: (el.getAttribute("data-testid") ?? el.tagName.toLowerCase()) +
          "." + (el.className || "").toString().slice(0, 60),
        parent:
          (parent.getAttribute("data-testid") ?? parent.tagName.toLowerCase()) +
          "." + (parent.className || "").toString().slice(0, 40),
        by: Math.round(by),
        text: (el.textContent ?? "").trim().slice(0, 50),
      });
    }
  }
  return {
    doc: doc.scrollWidth - doc.clientWidth,
    bodyScroll: document.body.scrollWidth,
    clientWidth: doc.clientWidth,
    escapes: rows.slice(0, 40),
    total: rows.length,
  };
});

console.log(`${name} @${width}px`);
console.log(`  document overflow: ${out.doc}px (scroll ${out.bodyScroll} / client ${out.clientWidth})`);
console.log(`  child-escapes-parent (ALL elements): ${out.total}`);
for (const r of out.escapes) {
  console.log(`   x ${r.el}\n       escapes ${r.parent} by ${r.by}px  "${r.text}"`);
}
await browser.close();
