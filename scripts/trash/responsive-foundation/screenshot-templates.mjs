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
// The 8px grid from 360 does NOT land on every named width (390 and 820 are off
// it), so they were swept past and never screenshotted. Union the two sets and
// sort, so every named width is both measured and captured.
for (const w of NAMED) if (!SWEEP.includes(w)) SWEEP.push(w);
SWEEP.sort((a, b) => a - b);

/**
 * Reproduces the authenticated shell around the page fragment: a 64px fixed rail
 * and a 56px top bar, matching AppRail/AppTopBar. Without it the measurements
 * would flatter the page — the real Templates page never gets the full viewport.
 */
function pageHtml(fragment, width, pageLabel = "Templates") {
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
          <span data-testid="app-shell-page-context" class="min-w-0 truncate text-sm font-semibold text-foreground">${pageLabel}</span>
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
      ${showRail ? "" : mobileBar(pageLabel)}
      ${fragment}
    </div>
  </div>
</body></html>`;
}

/**
 * RESPONSIVE-PAGES-2 — the mobile bar, rendered below `md` exactly as AppShell
 * does (the desktop bar is `hidden md:flex`, this one is `md:hidden`). Mirrors
 * the fixed AppMobileBar: identity group `flex-1 min-w-0`, controls `shrink-0`.
 */
const mobileBar = (pageLabel) => `<header data-testid="app-shell-mobile-bar" class="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-card px-3 md:hidden">
  <div class="flex min-w-0 flex-1 items-center gap-2">
    <button class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border"></button>
    <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40"></span>
    <span class="mx-1 h-5 w-px shrink-0 bg-border"></span>
    <span data-testid="app-shell-page-context" class="min-w-0 truncate text-sm font-semibold text-foreground">${pageLabel}</span>
  </div>
  <div class="flex shrink-0 items-center gap-2">
    <button class="h-9 w-9 shrink-0 rounded-md border border-border"></button>
    <button class="h-9 w-9 shrink-0 rounded-full border border-border"></button>
  </div>
</header>`;

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
  // RESPONSIVE-PAGES-2 — Workflows + shared-shell regions.
  '[data-testid="app-shell-mobile-bar"]',
  '[data-testid="workflows-toolbar"]',
  '[data-testid="workflows-tabs"]',
  '[data-testid="workflows-stat-cards"]',
  '[data-testid="workflows-grid-view"]',
  '[data-testid="workflow-card"]',
  '[data-testid="workflows-empty-state"]',
  '[data-testid="workflows-toast"]',
  // RESPONSIVE-SETTINGS-3 — Account Settings regions. `settings-panel` and
  // `setting-row` are the two that matter most: a settings page fails as a
  // hundred small containment failures inside cards and label/control rows, not
  // as one page-level burst, so every card and every form row is measured
  // individually at every swept width.
  '[data-testid="account-settings"]',
  '[data-testid="account-settings-nav"]',
  '[data-testid="account-settings-nav-toggle"]',
  '[data-testid="account-settings-panel"]',
  '[data-testid="settings-panel"]',
  '[data-testid="setting-row"]',
  '[data-testid="account-deletion-card"]',
  '[data-testid="account-delete-form"]',
  '[data-testid="account-danger-non-personal"]',
  '[data-testid="api-keys-panel"]',
  '[data-testid="api-keys-list"]',
  '[data-testid="api-key-create-form"]',
  '[data-testid="mcp-tokens-panel"]',
  '[data-testid="mcp-tokens-list"]',
  '[data-testid="mfa-panel"]',
  '[data-testid="mfa-enroll-form"]',
  '[data-testid="security-change-password-form"]',
  '[data-testid="personal-plan-panel"]',
  '[data-testid="subscription-cancel-panel"]',
  '[data-testid="checkout-choice-dialog"]',
  '[data-testid="account-toast"]',
  // RESPONSIVE-TEAM-4 — Team management regions. The member and invitation rows
  // are matched by testid PREFIX because their ids are per-user/per-invite, and
  // a per-row assertion is the whole point: this page fails inside individual
  // rows where identity, a role control and a destructive action share a line.
  '[data-testid="team-dashboard"]',
  '[data-testid="team-settings-nav"]',
  '[data-testid="team-overview"]',
  '[data-testid="team-account-switcher"]',
  '[data-testid="team-account-list"]',
  '[data-testid^="team-account-0"]',
  '[data-testid="team-create-form"]',
  '[data-testid="team-account-actions"]',
  '[data-testid="team-transfer-form"]',
  '[data-testid="team-leave-form"]',
  '[data-testid="team-members-panel"]',
  '[data-testid="team-limit-notice"]',
  '[data-testid="team-invite-bar"]',
  '[data-testid="team-invite-link"]',
  '[data-testid="team-members-table"]',
  '[data-testid^="team-member-"]',
  '[data-testid^="team-remove-confirm-0"]',
  '[data-testid="team-pending-invites"]',
  '[data-testid^="team-invite-inv-"]',
  '[data-testid^="team-invite-email-form-"]',
  '[data-testid="team-invite-replacement"]',
  '[data-testid="team-roles-table"]',
  '[data-testid="team-toast"]',
  // RESPONSIVE-DATA-SURFACES-5 — workflow list/table + runs list. Row-level
  // regions matter most here for the same reason they did on Team: these pages
  // fail inside individual rows, where identity competes with badges, metadata
  // and an action control on one line.
  '[data-testid="workflows-list-view"]',
  '[data-testid="workflows-list-head"]',
  '[data-testid="workflow-row"]',
  '[data-testid="workflows-bulk-bar"]',
  '[data-testid="workflow-actions-menu-content"]',
  '[data-testid="workflows-empty-no-workflows"]',
  '[data-testid="runs-list"]',
  '[data-testid^="runs-row-1"]',
  '[data-testid="runs-empty-state-no-runs"]',
  '[data-testid="data-surface-toast"]',
  // RESPONSIVE-BUILDER-RUNS-6 — the builder's two run surfaces: the Runs tab
  // (history nav + selected-run detail + step timeline) and the latest-run
  // results drawer (the only per-step OUTPUT surface).
  '[data-testid="builder-runs-tab"]',
  '[data-testid="runs-nav"]',
  '[data-testid^="run-row-"]',
  '[data-testid="run-detail"]',
  '[data-testid="run-detail-actions"]',
  '[data-testid="run-error-classification"]',
  '[data-testid^="run-step-"]',
  '[data-testid="runs-empty-state"]',
  '[data-testid="builder-right-drawer"]',
  '[data-testid^="step-node-"]',
  '[data-testid="run-id"]',
  '[data-testid="builder-runs-toast"]',
];

const fragments = readdirSync(HTML_DIR)
  .filter(
    (f) =>
      /^(templates|workflows|consumers|account|team|wflist|runlist|brun)-/.test(f) &&
      f.endsWith(".html"),
  )
  .sort();
if (fragments.length === 0) {
  console.error("No templates-*.html fragments. Run the harness test first.");
  process.exit(2);
}

/** Page-context label matching the fragment, so the evidence isn't mislabelled. */
function labelFor(name) {
  if (name.startsWith("account-")) return "Account settings";
  if (name.startsWith("team-")) return "Team";
  if (name.startsWith("wflist-")) return "Workflows";
  if (name.startsWith("runlist-")) return "Runs";
  if (name.startsWith("brun-")) return "Workflow builder";
  if (name.startsWith("workflows-")) return "Workflows";
  if (name.startsWith("consumers-01")) return "Runs";
  if (name.startsWith("consumers-02")) return "Apps";
  if (name.startsWith("consumers-03")) return "Notifications";
  return "Templates";
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
    await page.setContent(pageHtml(fragment, width, labelFor(name)), { waitUntil: "load" });

    const result = await page.evaluate((regionSelectors) => {
      const doc = document.documentElement;
      const out = {
        docOverflow: doc.scrollWidth - doc.clientWidth,
        regions: [],
        escapes: [],
        deepEscapes: [],
        illegible: [],
        pannable: [],
      };
      for (const sel of regionSelectors) {
        for (const el of document.querySelectorAll(sel)) {
          // RESPONSIVE-BUILDER-RUNS-6 — separate the PAGE/PANEL question from the
          // LOCAL DATA VIEWER question, which is exactly the distinction the
          // builder's run surfaces need.
          //
          // An element that declares `overflow-x: auto|scroll` is an opt-in
          // scroller: a JSON/log viewer or a genuine provider table, where
          // content wider than the box is the POINT. Reporting its internal
          // scroll as a containment failure says nothing — the real question for
          // such an element is whether it was ALLOWED to scroll there, and that
          // is what `data-no-pan-below` answers. Surfaces that must never pan
          // (the Runs panel, its history nav, the run detail) carry that
          // declaration, so nothing is let off: the assertion moves to the right
          // instrument rather than being dropped. Its own containment (does the
          // scroller stay inside its card?) is still checked by the escape pass.
          const selfOverflowX = getComputedStyle(el).overflowX;
          const isDeclaredScroller =
            selfOverflowX === "auto" || selfOverflowX === "scroll";
          const overflow = isDeclaredScroller ? 0 : el.scrollWidth - el.clientWidth;
          const rect = el.getBoundingClientRect();
          out.regions.push({
            sel,
            overflow,
            right: Math.round(rect.right),
            left: Math.round(rect.left),
          });
          // A child visibly bursting out of this bounded region.
          //
          // Out-of-flow children (position: fixed/absolute) are EXCLUDED: they
          // are not laid out by this parent at all, so "escaping" it is not a
          // defect — a fixed toast is anchored to the viewport by design, and
          // the page container deliberately does not constrain overlays. They
          // are still measured against the VIEWPORT as their own region below,
          // so nothing is let off: the assertion is moved to the right frame of
          // reference, not weakened.
          for (const child of el.children) {
            const c = child.getBoundingClientRect();
            if (c.width === 0) continue;
            const pos = getComputedStyle(child).position;
            if (pos === "fixed" || pos === "absolute") continue;
            if (c.right - rect.right > 1 || rect.left - c.left > 1) {
              out.escapes.push({
                sel,
                child: child.getAttribute("data-testid") ?? child.tagName.toLowerCase(),
                by: Math.round(Math.max(c.right - rect.right, rect.left - c.left)),
              });
            }
          }

          // RESPONSIVE-SETTINGS-3 — the same containment question, asked of EVERY
          // descendant against ITS OWN parent rather than only of direct children
          // against the region.
          //
          // A card-grid page fails as one visible burst, so the direct-child check
          // was enough for it. A settings page does not: it fails as a long input,
          // a 74-character email, or a two-button action row bursting out of the
          // small box three levels down that is supposed to hold it. Worse, the
          // settings card (`Panel`) carries `overflow-hidden` for its rounded
          // corners, which CLIPS that burst — so the document-level scrollWidth
          // check stays green while the content is visibly cut off. Walking
          // descendants is what makes the clipped failure measurable.
          for (const node of el.querySelectorAll("*")) {
            const c = node.getBoundingClientRect();
            if (c.width === 0) continue;
            const pos = getComputedStyle(node).position;
            if (pos === "fixed" || pos === "absolute") continue;

            // `display: contents` generates NO box, so its rect is empty and
            // every child "escapes" it. Walk up to the nearest ancestor that
            // actually generates one — which is the element genuinely
            // responsible for laying this node out. This keeps the node under
            // assertion rather than skipping it: coverage moves to the right
            // parent, it is not dropped. (The Team roster uses `sm:contents` to
            // dissolve a card-mode wrapper back into grid tracks.)
            let parent = node.parentElement;
            while (parent && getComputedStyle(parent).display === "contents") {
              parent = parent.parentElement;
            }
            if (!parent) continue;
            const p = parent.getBoundingClientRect();
            // A scroller is a DELIBERATE local escape hatch: content wider than
            // the box is the point, and the box itself is measured for overflow
            // against ITS parent. Only skip when the parent genuinely scrolls.
            const parentOverflowX = getComputedStyle(parent).overflowX;
            if (parentOverflowX === "auto" || parentOverflowX === "scroll") continue;
            const by = Math.max(c.right - p.right, p.left - c.left);
            if (by > 1) {
              out.deepEscapes.push({
                sel,
                child: node.getAttribute("data-testid") ?? node.tagName.toLowerCase(),
                parent:
                  parent.getAttribute("data-testid") ??
                  `${parent.tagName.toLowerCase()}.${String(parent.className).split(" ").slice(0, 3).join(".")}`,
                by: Math.round(by),
              });
            }
          }
        }
      }
      // RESPONSIVE-TEAM-4 — LEGIBILITY, not just containment.
      //
      // The Team page taught this lesson the hard way. Its member roster is a CSS
      // grid whose identity track is `2.4fr` with `min-w-0`, so when space ran out
      // the name and email column was what collapsed — to 64px, of which 32px was
      // the avatar — while the role select, the date and the Remove button kept
      // their intrinsic widths. The pending-invite row was worse: the invitee's
      // email address, the single most important field on that row, laid out at
      // SEVEN pixels. Nothing escaped anything, so a pure containment sweep passed
      // it. "Contained" and "readable" are different claims and both are required.
      //
      // An element opts in by declaring the width below which it stops being
      // readable, e.g. `data-legible-min="140"`. The component owns the number —
      // the harness only enforces what the component claims — and an element that
      // has stacked to full width satisfies it for free.
      for (const el of document.querySelectorAll("[data-legible-min]")) {
        const min = Number(el.getAttribute("data-legible-min"));
        if (!Number.isFinite(min)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue; // not rendered
        if (rect.width + 1 < min) {
          out.illegible.push({
            what: el.getAttribute("data-legible-what") ?? el.tagName.toLowerCase(),
            width: Math.round(rect.width),
            min,
          });
        }
      }

      // RESPONSIVE-DATA-SURFACES-5 — PANNING, which containment and legibility
      // both miss by design.
      //
      // The workflows list is a hard `min-w-[880px]` grid inside an
      // `overflow-x-auto` card. Nothing overflows the document (the scroller
      // absorbs it) and nothing is squeezed (inside the scroller every column has
      // its full width) — so both existing assertions pass while a phone user has
      // to drag an 880px table sideways to reach the actions column. That is the
      // exact failure the brief names, and it needs its own assertion.
      //
      // A region opts in by declaring the width below which panning is NOT an
      // acceptable answer, e.g. `data-no-pan-below="1024"`. This is deliberately
      // opt-in: a genuinely irreducible matrix (the Team roles table) or a JSON
      // viewer is ALLOWED to pan, and stays un-annotated.
      for (const el of document.querySelectorAll("[data-no-pan-below]")) {
        const below = Number(el.getAttribute("data-no-pan-below"));
        if (!Number.isFinite(below)) continue;
        if (document.documentElement.clientWidth >= below) continue;
        const pan = el.scrollWidth - el.clientWidth;
        if (pan > 1) {
          out.pannable.push({
            what: el.getAttribute("data-testid") ?? el.tagName.toLowerCase(),
            pan: Math.round(pan),
            below,
          });
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
    for (const e of result.deepEscapes) {
      failures.push(`${name} @${width}px — ${e.child} escapes its parent ${e.parent} by ${e.by}px`);
    }
    for (const e of result.illegible) {
      failures.push(
        `${name} @${width}px — ${e.what} squeezed to ${e.width}px (needs ${e.min}px to stay readable)`,
      );
    }
    for (const e of result.pannable) {
      failures.push(
        `${name} @${width}px — ${e.what} needs ${e.pan}px of sideways panning to reach its controls (must not below ${e.below}px)`,
      );
    }

    // `SHOTS=0` measures only. The sweep is the gate; the screenshots are owner
    // evidence, and re-shooting 100+ full-page PNGs on every measure-fix-measure
    // iteration is the slow part. The measurement itself is never skipped.
    if (named && process.env.SHOTS !== "0") {
      // One folder per state. Flat output put 100+ files in a single directory,
      // which trips the repo's leaf-folder count lint (it scans the filesystem,
      // and `owner-review/` being gitignored does not exempt it). Per-state
      // folders are also simply easier to review.
      const stateDir = join(SHOT_DIR, name);
      mkdirSync(stateDir, { recursive: true });
      await page.screenshot({ path: join(stateDir, `${width}.png`), fullPage: true });
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
console.log(`\nFAIL — ${unique.length} distinct problems.`);

// The same defect repeats at every width it breaks at, so a flat list buries the
// handful of ROOT CAUSES under hundreds of near-duplicate lines. Collapse each
// failure to (state, shape) and report the width RANGE it breaks across — that is
// the form a fix is actually planned from.
const groups = new Map();
for (const f of unique) {
  const m = /^(\S+) @(\d+)px — (.*)$/.exec(f);
  if (!m) continue;
  const key = `${m[1]} :: ${m[3].replace(/\d+px/g, "Npx")}`;
  const g = groups.get(key) ?? { widths: [], sample: m[3] };
  g.widths.push(Number(m[2]));
  groups.set(key, g);
}
const sorted = [...groups.entries()].sort((a, b) => b[1].widths.length - a[1].widths.length);
console.log(`\n${sorted.length} distinct (state × defect) groups:`);
for (const [key, g] of sorted) {
  const lo = Math.min(...g.widths);
  const hi = Math.max(...g.widths);
  console.log(`  x ${key}\n      breaks at ${g.widths.length} widths, ${lo}px–${hi}px`);
}
process.exit(1);
