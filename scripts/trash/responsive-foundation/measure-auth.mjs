/**
 * RESPONSIVE-AUTH-8 — authentication surface continuous width+height verification.
 *
 * A sibling of `screenshot-templates.mjs`, with the SAME three assertion classes
 * (containment · legibility floors · horizontal-panning policy) per
 * `docs/rules/responsive-layout-and-validation.md`.
 *
 * It is a separate script rather than another branch inside the shell harness for
 * one structural reason: the auth routes do NOT render the authenticated app shell.
 * There is no rail and no top bar to reproduce — `.au-root` owns the whole viewport
 * and brings its own scoped stylesheet in the fragment. Wrapping auth fragments in
 * the shell chrome would measure a page that does not exist.
 *
 * Auth is also the first surface where HEIGHT is load-bearing: the form well is
 * vertically centred, so a short viewport can push the submit control out of reach
 * in a way no width sweep can see. So the sweep is two-dimensional.
 *
 * Run:
 *   npm test -- --testMatch='**\/tests/tools/authScreens.harness.test.tsx'
 *   npx tailwindcss -i app/globals.css -o owner-review/html/tailwind.css --minify
 *   node scripts/trash/responsive-foundation/measure-auth.mjs
 */
import { chromium } from "playwright";
import { readFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const HTML_DIR = join(process.cwd(), "owner-review", "html");
const SHOT_DIR = join(process.cwd(), "owner-review", "responsive-auth");
const CSS = join(HTML_DIR, "tailwind.css");

if (!existsSync(CSS)) {
  console.error(`Missing ${CSS}. Build it first with:\n  npx tailwindcss -i app/globals.css -o owner-review/html/tailwind.css --minify`);
  process.exit(2);
}
mkdirSync(SHOT_DIR, { recursive: true });
const css = readFileSync(CSS, "utf8");

const NAMED = [1600, 1440, 1200, 1024, 820, 640, 480, 390, 360];
const SWEEP = [];
for (let w = 360; w <= 1600; w += 8) SWEEP.push(w);
for (const w of NAMED) if (!SWEEP.includes(w)) SWEEP.push(w);
SWEEP.sort((a, b) => a - b);

/** The tall default for the width sweep. */
const SWEEP_HEIGHT = 900;
/**
 * Representative heights, swept at the widths where a short screen actually bites
 * (a phone in landscape, a small laptop). Every width × every height would be
 * ~600 extra measurements per state for no new information — the height failure
 * mode is "the card is centred and taller than the viewport", which does not
 * depend on being at 1592px wide.
 */
const HEIGHTS = [900, 768, 640, 568];
const HEIGHT_WIDTHS = [360, 390, 480, 640, 820, 1024];

/**
 * The auth page frame. No app shell: `.au-root` IS the page. `overflow-x: auto` on
 * the body makes accidental horizontal overflow visible and measurable rather than
 * clipped, exactly as the shell harness does.
 */
function pageHtml(fragment) {
  return `<!doctype html>
<html lang="en" data-theme="dark"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style>
<style>
  html,body{margin:0;padding:0}
  body{overflow-x:auto}
</style>
</head>
<body>${fragment}</body></html>`;
}

/** Every bounded region of the auth surface that is checked individually. */
const REGIONS = [
  ".au-root",
  ".au-form-col",
  ".au-head",
  ".au-ctx",
  ".au-body",
  ".au-inner",
  ".au-title",
  ".au-sub",
  ".au-social",
  ".au-sso",
  ".au-divider",
  ".au-fields",
  ".au-fld",
  ".au-fld-top",
  ".au-inp",
  ".au-code",
  ".au-code-cell",
  ".au-submit",
  ".au-alert",
  ".au-status",
  ".au-note",
  ".au-swap",
  ".au-back",
  ".au-badge",
  ".au-foot",
  ".au-show",
  ".au-show-content",
  '[data-testid="turnstile-widget"]',
  '[data-testid="turnstile-frame"]',
];

const fragments = readdirSync(HTML_DIR)
  .filter((f) => /^auth-/.test(f) && f.endsWith(".html"))
  .sort();
if (fragments.length === 0) {
  console.error("No auth-*.html fragments. Run the harness test first.");
  process.exit(2);
}

const failures = [];
let checks = 0;

const browser = await chromium.launch();
const page = await browser.newPage();

/** The measurement, run inside the page. Identical assertion classes to the shell harness. */
async function measure(width, height) {
  return page.evaluate((regionSelectors) => {
    const doc = document.documentElement;
    const out = {
      docOverflow: doc.scrollWidth - doc.clientWidth,
      regions: [],
      escapes: [],
      deepEscapes: [],
      illegible: [],
      pannable: [],
      unreachable: [],
    };
    for (const sel of regionSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        const selfOverflowX = getComputedStyle(el).overflowX;
        const isDeclaredScroller = selfOverflowX === "auto" || selfOverflowX === "scroll";
        const overflow = isDeclaredScroller ? 0 : el.scrollWidth - el.clientWidth;
        const rect = el.getBoundingClientRect();
        out.regions.push({
          sel,
          overflow,
          right: Math.round(rect.right),
          left: Math.round(rect.left),
        });
        for (const child of el.children) {
          const c = child.getBoundingClientRect();
          if (c.width === 0) continue;
          const pos = getComputedStyle(child).position;
          if (pos === "fixed" || pos === "absolute") continue;
          if (c.right - rect.right > 1 || rect.left - c.left > 1) {
            out.escapes.push({
              sel,
              child: child.getAttribute("data-testid") ?? (child.className || child.tagName.toLowerCase()),
              by: Math.round(Math.max(c.right - rect.right, rect.left - c.left)),
            });
          }
        }
        for (const node of el.querySelectorAll("*")) {
          const c = node.getBoundingClientRect();
          if (c.width === 0) continue;
          const pos = getComputedStyle(node).position;
          if (pos === "fixed" || pos === "absolute") continue;
          let parent = node.parentElement;
          while (parent && getComputedStyle(parent).display === "contents") {
            parent = parent.parentElement;
          }
          if (!parent) continue;
          const p = parent.getBoundingClientRect();
          const parentOverflowX = getComputedStyle(parent).overflowX;
          if (parentOverflowX === "auto" || parentOverflowX === "scroll") continue;
          const by = Math.max(c.right - p.right, p.left - c.left);
          if (by > 1) {
            out.deepEscapes.push({
              sel,
              child: node.getAttribute("data-testid") ?? (node.className || node.tagName.toLowerCase()),
              parent: parent.getAttribute("data-testid") ?? (parent.className || parent.tagName.toLowerCase()),
              by: Math.round(by),
            });
          }
        }
      }
    }
    for (const el of document.querySelectorAll("[data-legible-min]")) {
      const min = Number(el.getAttribute("data-legible-min"));
      if (!Number.isFinite(min)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.width + 1 < min) {
        out.illegible.push({
          what: el.getAttribute("data-legible-what") ?? el.tagName.toLowerCase(),
          width: Math.round(rect.width),
          min,
        });
      }
    }
    for (const el of document.querySelectorAll("[data-no-pan-below]")) {
      const below = Number(el.getAttribute("data-no-pan-below"));
      if (!Number.isFinite(below)) continue;
      if (document.documentElement.clientWidth >= below) continue;
      const pan = el.scrollWidth - el.clientWidth;
      if (pan > 1) {
        out.pannable.push({
          what: el.getAttribute("data-testid") ?? (el.className || el.tagName.toLowerCase()),
          pan: Math.round(pan),
          below,
        });
      }
    }

    // VERTICAL REACHABILITY. Auth centres its form well, so the failure mode a
    // width sweep cannot see is: the card is taller than a short viewport and the
    // submit control sits above or below the scrollable area. The page MUST be able
    // to scroll to it — so the test is not "is it on screen" (it needn't be) but
    // "does the document actually extend far enough to reach it, without the
    // centring pushing it off the top where no scroll can recover it".
    const submit = document.querySelector(".au-submit");
    if (submit) {
      const r = submit.getBoundingClientRect();
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop || 0;
      const absTop = r.top + scrollTop;
      const absBottom = r.bottom + scrollTop;
      // Negative absolute top = clipped above the document origin, unreachable by
      // scrolling. Bottom beyond scrollHeight = clipped below.
      if (absTop < -1) {
        out.unreachable.push({ what: "submit", reason: `clipped ${Math.round(-absTop)}px above the document origin` });
      }
      if (absBottom - doc.scrollHeight > 1) {
        out.unreachable.push({
          what: "submit",
          reason: `extends ${Math.round(absBottom - doc.scrollHeight)}px past the scrollable height`,
        });
      }
    }
    return out;
  }, REGIONS);
}

function record(name, width, height, result, withHeight) {
  const at = withHeight ? `@${width}x${height}` : `@${width}px`;
  if (result.docOverflow > 1) {
    failures.push(`${name} ${at} — document overflow ${result.docOverflow}px`);
  }
  for (const r of result.regions) {
    if (r.overflow > 1) failures.push(`${name} ${at} — ${r.sel} scroll overflow ${r.overflow}px`);
    if (r.right - width > 1) {
      failures.push(`${name} ${at} — ${r.sel} extends ${Math.round(r.right - width)}px past the viewport`);
    }
  }
  for (const e of result.escapes) failures.push(`${name} ${at} — ${e.child} escapes ${e.sel} by ${e.by}px`);
  for (const e of result.deepEscapes) {
    failures.push(`${name} ${at} — ${e.child} escapes its parent ${e.parent} by ${e.by}px`);
  }
  for (const e of result.illegible) {
    failures.push(`${name} ${at} — ${e.what} squeezed to ${e.width}px (needs ${e.min}px to stay readable)`);
  }
  for (const e of result.pannable) {
    failures.push(`${name} ${at} — ${e.what} needs ${e.pan}px of sideways panning (must not below ${e.below}px)`);
  }
  for (const e of result.unreachable) {
    failures.push(`${name} ${at} — ${e.what} unreachable: ${e.reason}`);
  }
}

for (const file of fragments) {
  const name = file.replace(/\.html$/, "");
  const fragment = readFileSync(join(HTML_DIR, file), "utf8");
  const html = pageHtml(fragment);

  for (const width of SWEEP) {
    await page.setViewportSize({ width, height: SWEEP_HEIGHT });
    await page.setContent(html, { waitUntil: "load" });
    record(name, width, SWEEP_HEIGHT, await measure(width, SWEEP_HEIGHT), false);
    checks += 1;

    if (NAMED.includes(width) && process.env.SHOTS !== "0") {
      const stateDir = join(SHOT_DIR, name);
      mkdirSync(stateDir, { recursive: true });
      await page.screenshot({ path: join(stateDir, `${width}.png`), fullPage: true });
    }
  }

  for (const height of HEIGHTS) {
    for (const width of HEIGHT_WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.setContent(html, { waitUntil: "load" });
      record(name, width, height, await measure(width, height), true);
      checks += 1;
      if (height !== SWEEP_HEIGHT && process.env.SHOTS !== "0" && (width === 390 || width === 1024)) {
        const stateDir = join(SHOT_DIR, name, "short");
        mkdirSync(stateDir, { recursive: true });
        await page.screenshot({ path: join(stateDir, `${width}x${height}.png`), fullPage: true });
      }
    }
  }
}

await browser.close();

const unique = [...new Set(failures)];
console.log(`\nStates: ${fragments.length} · widths swept: ${SWEEP.length} (360→1600 step 8) · heights: ${HEIGHTS.join("/")} × ${HEIGHT_WIDTHS.length} widths · measurements: ${checks}`);
if (unique.length === 0) {
  console.log("\nPASS — no horizontal overflow, no region escapes, no illegible or pannable region, submit reachable at every measured size.");
  process.exit(0);
}
console.log(`\nFAIL — ${unique.length} distinct problems.`);

const groups = new Map();
for (const f of unique) {
  const m = /^(\S+) @([\dx]+)(?:px)? — (.*)$/.exec(f);
  if (!m) continue;
  const key = `${m[1]} :: ${m[3].replace(/\d+px/g, "Npx")}`;
  const g = groups.get(key) ?? { sizes: [], sample: m[3] };
  g.sizes.push(m[2]);
  groups.set(key, g);
}
const sorted = [...groups.entries()].sort((a, b) => b[1].sizes.length - a[1].sizes.length);
console.log(`\n${sorted.length} distinct (state × defect) groups:`);
for (const [key, g] of sorted) {
  const widths = g.sizes.filter((s) => !s.includes("x")).map(Number);
  const range = widths.length
    ? `${Math.min(...widths)}px–${Math.max(...widths)}px`
    : g.sizes.slice(0, 4).join(", ");
  console.log(`  x ${key}\n      breaks at ${g.sizes.length} sizes, ${range}`);
}
process.exit(1);
