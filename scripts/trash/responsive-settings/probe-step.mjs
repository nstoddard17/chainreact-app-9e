/** RESPONSIVE-BUILDER-RUNS-6 — why does a step card report scroll overflow? */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const [name = "brun-09-output-json", w = "1600"] = process.argv.slice(2);
const H = join(process.cwd(), "owner-review", "html");
const css = readFileSync(join(H, "tailwind.css"), "utf8");
const frag = readFileSync(join(H, `${name}.html`), "utf8");
const b = await chromium.launch();
const p = await b.newPage();
await p.setViewportSize({ width: Number(w), height: 900 });
await p.setContent(`<!doctype html><html><head><style>${css}</style><style>html,body{margin:0}body{overflow-x:auto}</style></head><body class="bg-background"><div class="flex min-h-screen"><div class="flex min-w-0 flex-1 flex-col">${frag}</div></div></body></html>`, { waitUntil: "load" });
const out = await p.evaluate(() => {
  const rows = [];
  for (const el of document.querySelectorAll('[data-testid^="step-node-"], [data-testid^="run-step-"], pre, code')) {
    rows.push({
      id: el.getAttribute("data-testid") ?? el.tagName.toLowerCase(),
      client: el.clientWidth, scroll: el.scrollWidth,
      overflow: el.scrollWidth - el.clientWidth,
      overflowX: getComputedStyle(el).overflowX,
      rect: Math.round(el.getBoundingClientRect().width),
    });
  }
  return rows;
});
console.log(`${name} @${w}px`);
for (const r of out) console.log(`  ${r.id.padEnd(22)} rect ${String(r.rect).padStart(5)}  client ${String(r.client).padStart(5)} scroll ${String(r.scroll).padStart(6)} over ${String(r.overflow).padStart(5)}  overflow-x:${r.overflowX}`);
await b.close();
