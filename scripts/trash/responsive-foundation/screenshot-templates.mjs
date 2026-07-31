/**
 * RESPONSIVE-FOUNDATION-1 — Templates continuous-width verification (§12 + §13).
 *
 * Wraps each `owner-review/html/templates-*.html` fragment (emitted by
 * `tests/tools/templatesScreens.harness.test.tsx`) with the project's COMPILED
 * Tailwind output plus the authenticated shell chrome, then across every required
 * width — and a dense sweep BETWEEN them — measures:
 *
 *   · document-level horizontal overflow (scrollWidth vs clientWidth)
 *   · per-region overflow for the top bar, page container, filter cluster,
 *     grid, every card, and the dialog
 *   · child-escapes-parent geometry, which a viewport-level pass alone misses:
 *     an element can sit inside the document while visibly bursting out of the
 *     card that is supposed to contain it
 *
 * No database, no auth, no dev server. Run:
 *   npm test -- --testMatch='**\/tests/tools/templatesScreens.harness.test.tsx'
 *   npx tailwindcss -i app/globals.css -o owner-review/html/tailwind.css --minify
 *   node scripts/trash/responsive-foundation/screenshot-templates.mjs
 */
import { chromium } from "playwright";
import { readFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const HTML_DIR = join(process.cwd(), "owner-review", "html");
const SHOT_DIR = join(process.cwd(), "owner-review", "responsive-foundation");
const CSS = join(HTML_DIR, "tailwind.css");

if (!existsSync(CSS)) {
  console.error(`Missing ${CSS}. Build it first with:\n  npx tailwindcss -i app/globals.css -o owner-review/html/tailwind.css --minify`);
  process.exit(2);
}
mkdirSync(SHOT_DIR, { recursive: true });
const css = readFileSync(CSS, "utf8");

/** The widths the brief names for screenshots. */
const NAMED = [1600, 1440, 1200, 1024, 820, 640, 480, 390, 360];
/**
 * The dense sweep. The point is to find breakage BETWEEN the named widths — a
 * layout can pass at 640 and 480 and still tear at 517. Steps of 8px from 360 to
 * 1600 is 156 measurements per state, cheap because only geometry is read.
 */
const SWEEP = [];
for (let w = 360; w <= 1600; w += 8) SWEEP.push(w);

/**
 * Reproduces the authenticated shell around the page fragment: a 64px fixed rail
 * and a 56px top bar, matching AppRail/AppTopBar. Without it the measurements
 * would flatter the page — the real Templates page never gets the full viewport.
 */
function pageHtml(fragment, width) {
  const showRail = width >= 768; // AppRail is `hidden md:flex`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
<style>
  html,body{margin:0;padding:0}
  /* Make any accidental horizontal overflow VISIBLE rather than clipped, so the
     measurement is honest. Nothing here hides overflow. */
  body{overflow-x:auto}
</style>
</head>
<body class="bg-background text-foreground">
  <div data-app-surface="dark" data-testid="app-shell-root" class="flex min-h-screen bg-background text-foreground">
    ${showRail ? '<aside data-testid="app-shell-rail" class="sticky top-0 hidden h-screen w-16 shrink-0 flex-col items-center gap-3 border-r border-border bg-card py-3 md:flex"></aside>' : ""}
    <div class="flex min-w-0 flex-1 flex-col">
      <header data-testid="app-shell-top-bar" class="sticky top-0 z-30 hidden h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:px-6 md:flex">
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <button class="flex min-w-0 shrink max-w-[220px] items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left">
            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/15 text-[11px] font-bold text-primary">A</span>
            <span class="min-w-0"><span class="block truncate text-xs font-semibold">Acme Corporation Holdings International</span><span class="block text-[10px] text-muted-foreground">Business</span></span>
          </button>
          <span data-testid="app-shell-page-context" class="min-w-0 truncate text-sm font-semibold text-foreground">Templates</span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <a data-testid="usage-meter" class="hidden shrink-0 items-center gap-3 rounded-md border border-border bg-background px-2.5 py-1.5 lg:flex">
            <span class="flex items-center gap-1.5"><span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tasks</span><span class="h-1 w-14 overflow-hidden rounded-full bg-muted"></span><span class="whitespace-nowrap text-[10px] text-muted-foreground">8,420 left</span></span>
            <span class="flex items-center gap-1.5"><span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">AI</span><span class="h-1 w-14 overflow-hidden rounded-full bg-muted"></span><span class="whitespace-nowrap text-[10px] text-muted-foreground">310 left</span></span>
          </a>
          <a data-testid="usage-meter-compact" class="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold tabular-nums lg:hidden"><span>AI</span><span>310</span></a>
          <button class="h-9 w-9 shrink-0 rounded-md border border-border"></button>
          <button class="h-9 w-9 shrink-0 rounded-full border border-border"></button>
        </div>
      </header>
      ${fragment}
    </div>
  </div>
</body></html>`;
}

/** Every bounded region the brief asks to be checked individually. */
const REGIONS = [
  '[data-testid="app-shell-top-bar"]',
  '[data-testid="app-page-container"]',
  '[data-testid="templates-controls-row"]',
  '[data-testid="templates-controls"]',
  '[data-testid="templates-category-chips"]',
  '[data-testid="templates-grid"]',
  '[data-testid="template-card"]',
  '[data-testid="templates-empty"]',
  '[data-testid="template-details-dialog"]',
];

const fragments = readdirSync(HTML_DIR)
  .filter((f) => f.startsWith("templates-") && f.endsWith(".html"))
  .sort();
if (fragments.length === 0) {
  console.error("No templates-*.html fragments. Run the harness test first.");
  process.exit(2);
}

const failures = [];
let checks = 0;

const browser = await chromium.launch();
const page = await browser.newPage();

for (const file of fragments) {
  const name = file.replace(/\.html$/, "");
  const fragment = readFileSync(join(HTML_DIR, file), "utf8");

  for (const width of SWEEP) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(pageHtml(fragment, width), { waitUntil: "load" });

    const result = await page.evaluate((regionSelectors) => {
      const doc = document.documentElement;
      const out = {
        docOverflow: doc.scrollWidth - doc.clientWidth,
        regions: [],
        escapes: [],
      };
      for (const sel of regionSelectors) {
        for (const el of document.querySelectorAll(sel)) {
          const overflow = el.scrollWidth - el.clientWidth;
          const rect = el.getBoundingClientRect();
          out.regions.push({
            sel,
            overflow,
            right: Math.round(rect.right),
            left: Math.round(rect.left),
          });
          // A child visibly bursting out of this bounded region.
          for (const child of el.children) {
            const c = child.getBoundingClientRect();
            if (c.width === 0) continue;
            if (c.right - rect.right > 1 || rect.left - c.left > 1) {
              out.escapes.push({
                sel,
                child: child.getAttribute("data-testid") ?? child.tagName.toLowerCase(),
                by: Math.round(Math.max(c.right - rect.right, rect.left - c.left)),
              });
            }
          }
        }
      }
      return out;
    }, REGIONS);

    checks += 1;
    const named = NAMED.includes(width);

    if (result.docOverflow > 1) {
      failures.push(`${name} @${width}px — document overflow ${result.docOverflow}px`);
    }
    for (const r of result.regions) {
      if (r.overflow > 1) {
        failures.push(`${name} @${width}px — ${r.sel} scroll overflow ${r.overflow}px`);
      }
      if (r.right - width > 1) {
        failures.push(`${name} @${width}px — ${r.sel} extends ${Math.round(r.right - width)}px past the viewport`);
      }
    }
    for (const e of result.escapes) {
      failures.push(`${name} @${width}px — ${e.child} escapes ${e.sel} by ${e.by}px`);
    }

    if (named) {
      await page.screenshot({ path: join(SHOT_DIR, `${name}-${width}.png`), fullPage: true });
    }
  }
}

await browser.close();

const unique = [...new Set(failures)];
console.log(`\nStates: ${fragments.length} · widths swept: ${SWEEP.length} (360→1600 step 8) · measurements: ${checks}`);
console.log(`Screenshots written for ${NAMED.length} named widths → owner-review/responsive-foundation/`);
if (unique.length === 0) {
  console.log("\nPASS — no horizontal overflow and no region escapes at any swept width.");
  process.exit(0);
}
console.log(`\nFAIL — ${unique.length} distinct problems:`);
for (const f of unique.slice(0, 60)) console.log("  x " + f);
if (unique.length > 60) console.log(`  … and ${unique.length - 60} more`);
process.exit(1);
