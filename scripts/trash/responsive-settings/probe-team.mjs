/**
 * RESPONSIVE-TEAM-4 — member/invitation row legibility probe.
 *
 * The containment sweep can pass on this page while it is still unusable: the
 * members "table" is a CSS grid whose first track is `2.4fr` with `min-w-0`, so
 * when space runs out the IDENTITY column is what collapses — to 30px — while the
 * role select, the date and the Remove button keep their intrinsic widths. Nothing
 * escapes anything. The row is simply illegible.
 *
 * So this prints the actual laid-out width of each column, which is the number the
 * fix has to move.
 *
 *   node scripts/trash/responsive-settings/probe-team.mjs team-02-members-typical 360
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [name = "team-02-members-typical", widthArg = "360"] = process.argv.slice(2);
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
  const rows = [];
  for (const row of document.querySelectorAll('[data-testid^="team-member-"]')) {
    const cells = [...row.querySelectorAll(":scope > div > *")].map((c) => ({
      w: Math.round(c.getBoundingClientRect().width),
      text: (c.textContent ?? "").trim().slice(0, 28),
    }));
    rows.push({ id: row.getAttribute("data-testid").slice(-6), cells });
  }
  const invites = [];
  for (const iv of document.querySelectorAll('[data-testid^="team-invite-inv-"]')) {
    const idBlock = iv.querySelector(":scope > div > div");
    invites.push({
      id: iv.getAttribute("data-testid"),
      identityWidth: idBlock ? Math.round(idBlock.getBoundingClientRect().width) : null,
      rowScroll: iv.scrollWidth,
      rowClient: iv.clientWidth,
    });
  }
  // Every element that declares a minimum readable width, with what it actually
  // got. This is the number the sweep gates on, and seeing it directly is what
  // caught the floor firing on genuinely SHORT names (a 91px box holding "Team
  // member" is not squeezed) — which is why the declaration moved onto the
  // ALLOCATED cell rather than the shrink-wrapped identity block.
  const legible = [...document.querySelectorAll("[data-legible-min]")].map((e) => ({
    what: e.getAttribute("data-legible-what"),
    min: Number(e.getAttribute("data-legible-min")),
    w: Math.round(e.getBoundingClientRect().width),
    text: (e.textContent ?? "").trim().slice(0, 30),
  }));

  return { rows, invites, legible };
});

console.log(`${name} @${width}px`);
for (const r of out.rows) {
  console.log(`  member …${r.id}`);
  for (const c of r.cells) console.log(`      ${String(c.w).padStart(5)}px  "${c.text}"`);
}
for (const i of out.invites) {
  console.log(`  ${i.id}: identity ${i.identityWidth}px  row scroll ${i.rowScroll}/${i.rowClient}`);
}
console.log("  declared legibility floors:");
for (const l of out.legible) {
  const verdict = l.w + 1 < l.min ? "FAIL" : "ok  ";
  console.log(`   ${verdict} ${String(l.w).padStart(5)}px / ${l.min}px  ${l.what}  "${l.text}"`);
}
await browser.close();
