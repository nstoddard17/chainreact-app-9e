import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The default Overview board in a real browser
 * (ANALYTICS-DEFAULT-OVERVIEW-WELCOME-FIRST-1).
 *
 * Backend-free: `/dev-drag-harness?board=default` mounts the REAL
 * AnalyticsDashboard with `DEFAULT_OVERVIEW_WIDGETS` verbatim, in the same LEGACY
 * form the server seeds — so what is measured here is the derivation a brand-new
 * account actually gets. No Supabase, no auth, no database, no new public route.
 *
 * The unit suite proves the ENGINE puts the welcome note at `x: 0, y: 0`; only a
 * browser proves CSS Grid turns that rectangle into the top-left pixels, with
 * nothing above it or to its left.
 *
 * Two navigations total (one shared read-only page, one for the resize test) —
 * see `chartSurfaces.spec.ts` for why this suite keeps that count low.
 */

const GAP = 14;
const MIN_CELL = 220;
const TOL = 1.5;
const VIEWPORT = { width: 1600, height: 1600 };

const WELCOME = "ov-note";
/** Every default widget id, in the canonical array order. */
const DEFAULT_IDS = [
  "ov-note",
  "ov-runs",
  "ov-success",
  "ov-active",
  "ov-duration",
  "ov-overtime",
  "ov-outcome",
  "ov-top",
  "ov-heatmap",
  "ov-apps",
  "ov-recent",
];

const grid = (page: Page) => page.getByTestId("analytics-explicit-grid");
const cell = (page: Page, id: string) => page.getByTestId(`analytics-grid-cell-${id}`);

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
}

/** Every rendered cell's rectangle and grid coordinates, in one snapshot. */
async function cells(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="analytics-grid-cell-"]')).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute("data-widget-id") ?? "",
        x: Number(el.getAttribute("data-grid-x")),
        y: Number(el.getAttribute("data-grid-y")),
        w: Number(el.getAttribute("data-grid-w")),
        h: Number(el.getAttribute("data-grid-h")),
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
      };
    }),
  );
}

const gridColumns = (page: Page) =>
  grid(page).evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);

let writes: string[] = [];
let pageErrors: string[] = [];

function watch(page: Page) {
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("request", (req) => {
    if (req.method() !== "GET" && /\/api\/analytics/.test(req.url())) {
      writes.push(`${req.method()} ${req.url()}`);
    }
  });
}

async function openDefaultBoard(page: Page) {
  await page.setViewportSize(VIEWPORT);
  // A recompiling `next dev` answers 404; that is harness availability, not a
  // layout signal.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/dev-drag-harness?board=default", { waitUntil: "domcontentloaded" });
    if (await grid(page).count()) break;
    await page.waitForTimeout(1000);
  }
  await expect(grid(page)).toBeVisible();
  await expect(cell(page, WELCOME)).toBeVisible();
}

// ═══ The board as a new account first sees it ════════════════════════════════

test.describe("the default board at four columns", () => {
  test.describe.configure({ mode: "serial" });

  let view: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    view = await context.newPage();
    watch(view);
    await openDefaultBoard(view);
    await expect.poll(() => gridColumns(view)).toBe(4);
  });

  test.afterAll(async () => {
    await view.context().close();
  });

  test.beforeEach(() => {
    writes = [];
    pageErrors = [];
  });

  test.afterEach(() => expect(pageErrors, "uncaught page exceptions").toEqual([]));

  test("renders every default widget exactly once", async () => {
    const ids = (await cells(view)).map((c) => c.id);
    expect([...ids].sort()).toEqual([...DEFAULT_IDS].sort());
    expect(new Set(ids).size).toBe(DEFAULT_IDS.length);
  });

  test("the welcome card is the top-left one, flush with the grid's own corner", async () => {
    const [welcome, gridBox] = [await box(cell(view, WELCOME)), await box(grid(view))];
    expect(Math.abs(welcome.x - gridBox.x), "left edge aligns with the grid").toBeLessThanOrEqual(
      TOL,
    );
    expect(Math.abs(welcome.y - gridBox.y), "top edge aligns with the grid").toBeLessThanOrEqual(
      TOL,
    );
    // …and it really is the widget the engine placed at 0,0.
    expect(await cell(view, WELCOME).getAttribute("data-grid-x")).toBe("0");
    expect(await cell(view, WELCOME).getAttribute("data-grid-y")).toBe("0");
  });

  test("no card renders above it or to its left", async () => {
    const all = await cells(view);
    const welcome = all.find((c) => c.id === WELCOME)!;
    const precede = all
      .filter((c) => c.id !== WELCOME)
      .filter((c) => c.bottom <= welcome.top + TOL || c.right <= welcome.left + TOL)
      .map((c) => c.id);
    expect(precede).toEqual([]);
  });

  test("it spans two columns and one row, as its size preset means", async () => {
    const welcome = await box(cell(view, WELCOME));
    const single = await box(cell(view, "ov-runs"));
    expect(Math.round(welcome.height)).toBe(Math.round(single.height));
    expect(Math.round(welcome.width)).toBe(Math.round(single.width * 2 + GAP));
  });

  test("its title is the visible first thing on the board", async () => {
    await expect(
      cell(view, WELCOME).getByText("Welcome to your dashboard"),
    ).toBeVisible();
  });

  test("no two cards overlap anywhere on the board", async () => {
    const all = await cells(view);
    const overlaps: string[] = [];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i]!;
        const b = all[j]!;
        const hit =
          a.left < b.right - TOL &&
          a.right > b.left + TOL &&
          a.top < b.bottom - TOL &&
          a.bottom > b.top + TOL;
        if (hit) overlaps.push(`${a.id} ∩ ${b.id}`);
      }
    }
    expect(overlaps).toEqual([]);
  });

  test("every card stays inside the four canonical columns", async () => {
    for (const c of await cells(view)) {
      expect(c.x + c.w, `${c.id} right edge`).toBeLessThanOrEqual(4);
      expect(c.x, `${c.id} left edge`).toBeGreaterThanOrEqual(0);
    }
  });

  test("simply rendering the default board writes nothing", async () => {
    // A read path must never persist the derived arrangement.
    expect(writes).toEqual([]);
  });
});

// ═══ Narrow projections ══════════════════════════════════════════════════════

test.describe("narrower projections keep the welcome card first", () => {
  test.beforeEach(async ({ page }) => {
    writes = [];
    pageErrors = [];
    watch(page);
    await openDefaultBoard(page);
    await expect.poll(() => gridColumns(page)).toBe(4);
  });

  test.afterEach(() => expect(pageErrors, "uncaught page exceptions").toEqual([]));

  test("welcome stays top-left at 3, 2 and 1 columns, and resizing saves nothing", async ({
    page,
  }) => {
    const chrome = VIEWPORT.width - (await box(grid(page))).width;

    for (const columns of [3, 2, 1] as const) {
      const wantedGrid = columns * MIN_CELL + (columns - 1) * GAP + 8;
      await page.setViewportSize({
        width: Math.round(wantedGrid + chrome),
        height: VIEWPORT.height,
      });
      await expect.poll(() => gridColumns(page)).toBe(columns);

      const all = await cells(page);
      expect(all).toHaveLength(DEFAULT_IDS.length);
      const welcome = all.find((c) => c.id === WELCOME)!;
      expect({ x: welcome.x, y: welcome.y }, `welcome at ${columns} columns`).toEqual({
        x: 0,
        y: 0,
      });
      // Nothing renders above or left of it at this width either.
      const precede = all
        .filter((c) => c.id !== WELCOME)
        .filter((c) => c.bottom <= welcome.top + TOL || c.right <= welcome.left + TOL)
        .map((c) => c.id);
      expect(precede, `cards preceding welcome at ${columns} columns`).toEqual([]);
      // Canonical placement is untouched by the projection.
      expect(await cell(page, WELCOME).getAttribute("data-canonical-x")).toBe("0");
      expect(await cell(page, WELCOME).getAttribute("data-canonical-y")).toBe("0");
    }

    // Back to four columns, restored, still nothing written.
    await page.setViewportSize(VIEWPORT);
    await expect.poll(() => gridColumns(page)).toBe(4);
    const welcome = (await cells(page)).find((c) => c.id === WELCOME)!;
    expect({ x: welcome.x, y: welcome.y }).toEqual({ x: 0, y: 0 });
    expect(writes, "dashboard writes caused by resizing alone").toEqual([]);
  });
});
