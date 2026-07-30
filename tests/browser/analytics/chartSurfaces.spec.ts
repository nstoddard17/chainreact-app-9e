import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Analytics chart responsiveness, in a real browser
 * (ANALYTICS-RESPONSIVE-CHART-SURFACES-1).
 *
 * Backend-free: `/dev-drag-harness?board=charts` mounts the REAL
 * AnalyticsDashboard with an in-memory chart-fixture board — no Supabase, no
 * auth, no database, no new public route. See `playwright.analytics.config.ts`.
 *
 * These are the assertions jsdom cannot make. jsdom lays out nothing, so the
 * unit suite can only prove each chart EMITS the right geometry for a given box;
 * only a browser can prove the painted rectangle is inside the body it was given
 * at every footprint, and that a live resize redraws it.
 *
 * WHY ONE SHARED PAGE FOR THE READ-ONLY BLOCK. Most of these assertions just
 * measure a board that nothing has touched. Loading the harness once for all of
 * them takes this spec from 43 navigations to 11: a long-lived `next dev` server
 * degrades under repeated navigation of a chart-heavy route and starts answering
 * 404, which was turning a green suite amber for reasons that had nothing to do
 * with charts. Anything that mutates state — a resize, a projection change, an
 * edit session — still gets its own page.
 *
 * The fixture board (canonical four columns):
 *
 *   row 0:  Runs over time (2×1)      | By outcome (2×1)
 *   row 1:  When your automations run (3×1)          | Total runs (1×2)
 *   row 2:  Top automations (2×1)     | Runs small (1×1) | ·
 *   row 3:  Activity large (2×2)      | Outcome small (1×1) | Connected apps (1×1)
 *   row 4:          ·                 | Runs tall (1×2)
 *   row 5:  Outcome large (2×2)       |        ·
 *   row 7:  Automations full width (4×1)
 *   row 8:  Runs wide (3×1)                          | Success rate (1×1)
 */

const GAP = 14;
const MIN_CELL = 220;
const ROW = 190;
/** Subpixel slack: layout rounding, not a real overflow. */
const TOL = 1.5;
const VIEWPORT = { width: 1600, height: 1400 };

const body = (page: Page, id: string) => page.getByTestId(`analytics-widget-body-${id}`);
const surface = (page: Page, id: string) =>
  body(page, id).locator('[data-testid$="-surface"]').first();
const cell = (page: Page, id: string) => page.getByTestId(`analytics-grid-cell-${id}`);
const chartIn = (page: Page, id: string, chart: string) =>
  surface(page, id).locator(`[data-testid="${chart}"]`).first();

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
}

/** Assert `inner` is inside `outer` on all four edges. */
async function assertInside(inner: Locator, outer: Locator, what: string) {
  const [i, o] = [await box(inner), await box(outer)];
  expect(i.x, `${what}: left`).toBeGreaterThanOrEqual(o.x - TOL);
  expect(i.y, `${what}: top`).toBeGreaterThanOrEqual(o.y - TOL);
  expect(i.x + i.width, `${what}: right`).toBeLessThanOrEqual(o.x + o.width + TOL);
  expect(i.y + i.height, `${what}: bottom`).toBeLessThanOrEqual(o.y + o.height + TOL);
}

/** A chart surface must never scroll — a clipped chart is a bug, not a feature. */
async function assertNoScroll(locator: Locator, what: string) {
  const metrics = await locator.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(metrics.scrollWidth, `${what}: horizontal overflow`).toBeLessThanOrEqual(
    metrics.clientWidth + 1,
  );
  expect(metrics.scrollHeight, `${what}: vertical overflow`).toBeLessThanOrEqual(
    metrics.clientHeight + 1,
  );
}

const gridColumns = (page: Page) =>
  page
    .getByTestId("analytics-explicit-grid")
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);

/**
 * A fingerprint of every chart surface's measured box.
 *
 * Charts render at a fallback size for the frame before their observer reports,
 * so an assertion taken too early measures a chart mid-transition — which is a
 * test race, not a product bug. Waiting for two identical consecutive readings
 * means every later assertion is about the SETTLED chart.
 */
async function chartFingerprint(page: Page): Promise<string> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid$="-surface"][data-chart-measured]'))
      .map(
        (el) =>
          `${el.getAttribute("data-testid")}:${el.getAttribute("data-chart-measured")}:` +
          `${el.getAttribute("data-chart-width")}x${el.getAttribute("data-chart-height")}`,
      )
      .join("|"),
  );
}

async function waitForCharts(page: Page) {
  await expect
    .poll(
      async () => {
        const first = await chartFingerprint(page);
        if (first.length === 0 || first.includes(":false:")) return "unsettled";
        await page.waitForTimeout(60);
        return (await chartFingerprint(page)) === first ? "settled" : "unsettled";
      },
      // Generous: a cold `next dev` compiles this route on first hit, and a slow
      // compile is not a chart-sizing failure.
      { timeout: 30_000 },
    )
    .toBe("settled");
}

async function showColumns(page: Page, columns: 1 | 2 | 3 | 4) {
  await page.setViewportSize(VIEWPORT);
  const gridWidth = (await box(page.getByTestId("analytics-explicit-grid"))).width;
  const chrome = VIEWPORT.width - gridWidth;
  const wantedGrid = columns * MIN_CELL + (columns - 1) * GAP + 8;
  await page.setViewportSize({ width: Math.round(wantedGrid + chrome), height: VIEWPORT.height });
  await expect.poll(() => gridColumns(page)).toBe(columns);
  await waitForCharts(page);
}

// ── diagnostics ──────────────────────────────────────────────────────────────

/** Console errors and page exceptions, collected per test. */
let consoleErrors: string[] = [];
let pageErrors: string[] = [];
/** Any request that would WRITE the dashboard. Chart resizing must cause none. */
let writes: string[] = [];

function resetDiagnostics() {
  consoleErrors = [];
  pageErrors = [];
  writes = [];
}

function watch(page: Page) {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("request", (req) => {
    if (req.method() !== "GET" && /\/api\/analytics/.test(req.url())) {
      writes.push(`${req.method()} ${req.url()}`);
    }
  });
}

function assertClean() {
  // A ResizeObserver loop, an SVG dimension error or a non-finite coordinate all
  // surface here; none of them are acceptable.
  expect(pageErrors, "uncaught page exceptions").toEqual([]);
  expect(
    consoleErrors.filter((t) => !/favicon|Download the React DevTools/i.test(t)),
    "console errors",
  ).toEqual([]);
}

async function openHarness(page: Page) {
  await page.setViewportSize(VIEWPORT);
  // Retry the navigation: a `next dev` server that is recompiling answers 404,
  // which is a harness-availability problem and not a chart-sizing signal. Once
  // the board is on screen, every console error counts.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/dev-drag-harness?board=charts", { waitUntil: "domcontentloaded" });
    if (await page.getByTestId("analytics-explicit-grid").count()) break;
    await page.waitForTimeout(1000);
  }
  await expect(page.getByTestId("analytics-explicit-grid")).toBeVisible();
  await expect(cell(page, "c-line-2x1")).toBeVisible();
  resetDiagnostics();
  await waitForCharts(page);
}

/** Every chart widget on the fixture board, with the footprint it exercises. */
const CHART_WIDGETS: { id: string; footprint: string; chart: string }[] = [
  { id: "c-line-2x1", footprint: "2×1", chart: "analytics-line-chart" },
  { id: "c-donut-2x1", footprint: "2×1", chart: "analytics-donut" },
  { id: "c-heat-3x1", footprint: "3×1", chart: "analytics-heatmap" },
  { id: "c-stat-1x2", footprint: "1×2", chart: "analytics-sparkline" },
  { id: "c-bar-2x1", footprint: "2×1", chart: "analytics-bar-rows" },
  { id: "c-line-1x1", footprint: "1×1", chart: "analytics-line-chart" },
  { id: "c-heat-2x2", footprint: "2×2", chart: "analytics-heatmap" },
  { id: "c-donut-1x1", footprint: "1×1", chart: "analytics-donut" },
  { id: "c-bar-1x1", footprint: "1×1", chart: "analytics-bar-rows" },
  { id: "c-line-1x2", footprint: "1×2", chart: "analytics-line-chart" },
  { id: "c-donut-2x2", footprint: "2×2", chart: "analytics-donut" },
  { id: "c-bar-4x1", footprint: "4×1", chart: "analytics-bar-rows" },
  { id: "c-line-3x1", footprint: "3×1", chart: "analytics-line-chart" },
  { id: "c-stat-1x1", footprint: "1×1", chart: "analytics-sparkline" },
];

// ═══ Read-only: one board, measured many ways ════════════════════════════════

test.describe("the settled board", () => {
  test.describe.configure({ mode: "serial" });

  let view: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    view = await context.newPage();
    watch(view);
    await openHarness(view);
  });

  test.afterAll(async () => {
    await view.context().close();
  });

  // Diagnostics accumulate on a shared page, so each test judges only its own.
  test.beforeEach(() => resetDiagnostics());
  test.afterEach(() => assertClean());

  test.describe("every chart fits its widget body", () => {
    for (const { id, footprint, chart } of CHART_WIDGETS) {
      test(`${id} (${footprint}) draws inside its body and does not scroll`, async () => {
        const widgetBody = body(view, id);
        const chartSurface = surface(view, id);
        await expect(chartSurface).toBeVisible();
        const painted = chartIn(view, id, chart);
        await expect(painted).toBeVisible();

        await assertInside(chartSurface, widgetBody, `${id} surface in body`);
        await assertInside(painted, chartSurface, `${id} chart in surface`);
        await assertInside(painted, widgetBody, `${id} chart in body`);
        await assertNoScroll(chartSurface, `${id} surface`);
        await assertNoScroll(widgetBody, `${id} body`);
      });
    }

    test("no chart widget's content can grow its grid row", async () => {
      for (const { id } of CHART_WIDGETS) {
        const cellBox = await box(cell(view, id));
        const rows = Number((await cell(view, id).getAttribute("data-grid-h")) ?? "1");
        expect(Math.round(cellBox.height), `${id} row height`).toBe(rows * ROW + (rows - 1) * GAP);
      }
    });
  });

  test.describe("Runs over time", () => {
    /** The stroked data path — the visible line, not the gradient fill. */
    const linePath = (id: string) =>
      surface(view, id).locator('[data-testid="analytics-line-chart"] path[fill="none"]').first();

    test("the SVG fills its body without exceeding it", async () => {
      const svg = chartIn(view, "c-line-2x1", "analytics-line-chart");
      const [s, b] = [await box(svg), await box(surface(view, "c-line-2x1"))];
      await assertInside(svg, body(view, "c-line-2x1"), "line svg");
      // It FILLS the surface rather than merely fitting inside it.
      expect(s.width).toBeGreaterThan(b.width - 2);
      expect(s.height).toBeGreaterThan(b.height - 2);
    });

    test("the peak is visible, not clipped by the card", async () => {
      const svg = chartIn(view, "c-line-2x1", "analytics-line-chart");
      const [p, s] = [await box(linePath("c-line-2x1")), await box(svg)];
      // The spike's top edge is strictly inside the drawable area.
      expect(p.y).toBeGreaterThan(s.y);
      expect(p.y + p.height).toBeLessThan(s.y + s.height);
      await assertInside(linePath("c-line-2x1"), body(view, "c-line-2x1"), "line path");
    });

    test("axis content stays inside the body", async () => {
      // One snapshot in the page: reading each label over a separate round trip
      // lets the chart re-render between reads, which measures nothing useful.
      const report = await body(view, "c-line-2x1").evaluate((bodyEl) => {
        const bounds = bodyEl.getBoundingClientRect();
        const labels = Array.from(
          bodyEl.querySelectorAll('[data-testid="analytics-line-chart"] text'),
        );
        return {
          count: labels.length,
          outside: labels
            .map((el) => ({ text: el.textContent, r: el.getBoundingClientRect() }))
            .filter(
              ({ r }) =>
                r.left < bounds.left - 1.5 ||
                r.right > bounds.right + 1.5 ||
                r.top < bounds.top - 1.5 ||
                r.bottom > bounds.bottom + 1.5,
            )
            .map(({ text }) => text),
        };
      });
      expect(report.count).toBeGreaterThan(0);
      expect(report.outside, "axis labels outside the body").toEqual([]);
    });

    test("the plot expands with a wider widget and contracts with a narrower one", async () => {
      const wide = await box(linePath("c-line-3x1"));
      const narrow = await box(linePath("c-line-1x1"));
      expect(wide.width).toBeGreaterThan(narrow.width * 1.5);
      await assertInside(linePath("c-line-1x1"), body(view, "c-line-1x1"), "narrow line");
    });

    test("a tall widget gives the plot more height, still inside the body", async () => {
      const tall = await box(linePath("c-line-1x2"));
      const short = await box(linePath("c-line-1x1"));
      expect(tall.height).toBeGreaterThan(short.height);
      await assertInside(linePath("c-line-1x2"), body(view, "c-line-1x2"), "tall line");
    });
  });

  test.describe("metric sparklines", () => {
    test("use the width of the card, not a fixed ~140px stamp", async () => {
      const spark = chartIn(view, "c-stat-1x1", "analytics-sparkline");
      const [s, b] = [await box(spark), await box(surface(view, "c-stat-1x1"))];
      expect(s.width).toBeGreaterThan(b.width - 2);
      // A 1×1 card is already wider than the old fixed sparkline.
      expect(s.width).toBeGreaterThan(150);
    });

    test("keep the first and last point inside the SVG", async () => {
      const spark = chartIn(view, "c-stat-1x1", "analytics-sparkline");
      await assertInside(spark.locator('path[fill="none"]'), spark, "sparkline path");
      await assertInside(spark.locator("circle"), spark, "sparkline end dot");
    });
  });

  test.describe("By outcome donut", () => {
    const donut = (id: string) => chartIn(view, id, "analytics-donut");

    test("the ring stays inside the body on every edge, and stays circular", async () => {
      for (const id of ["c-donut-2x1", "c-donut-1x1", "c-donut-2x2"]) {
        await assertInside(donut(id), body(view, id), `${id} donut`);
        const d = await box(donut(id));
        expect(Math.abs(d.width - d.height), `${id} is circular`).toBeLessThanOrEqual(1);
      }
    });

    test("grows the ring in a larger widget", async () => {
      const large = await box(donut("c-donut-2x2"));
      const small = await box(donut("c-donut-1x1"));
      expect(large.width).toBeGreaterThan(small.width);
    });

    test("keeps the centre value centred and readable as text", async () => {
      const svg = donut("c-donut-2x2");
      const text = svg.locator("text").first();
      const [t, s] = [await box(text), await box(svg)];
      const centreDrift = Math.abs(t.x + t.width / 2 - (s.x + s.width / 2));
      expect(centreDrift, "centre readout is centred").toBeLessThanOrEqual(2);
      await assertInside(text, svg, "donut centre readout");
      // The legend carries the same numbers as text.
      await expect(body(view, "c-donut-2x2").getByText("Succeeded")).toBeVisible();
      await expect(body(view, "c-donut-2x2").getByText("Failed")).toBeVisible();
    });

    test("legend rows stay inside the body", async () => {
      for (const id of ["c-donut-2x1", "c-donut-2x2", "c-donut-1x1"]) {
        const rows = surface(view, id).locator("li");
        const count = await rows.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i += 1) {
          await assertInside(rows.nth(i), body(view, id), `${id} legend row ${i}`);
        }
      }
    });
  });

  test.describe("horizontal bar widgets", () => {
    test("label, bar and value all stay inside the body", async () => {
      for (const id of ["c-bar-2x1", "c-bar-4x1", "c-bar-1x1"]) {
        const rows = surface(view, id).locator('[data-testid="analytics-bar-row"]');
        const count = await rows.count();
        expect(count, `${id} rows`).toBeGreaterThan(0);
        for (let i = 0; i < count; i += 1) {
          await assertInside(rows.nth(i), body(view, id), `${id} row ${i}`);
          const cells = rows.nth(i).locator(":scope > *");
          for (let c = 0; c < (await cells.count()); c += 1) {
            await assertInside(cells.nth(c), body(view, id), `${id} row ${i} cell ${c}`);
          }
        }
      }
    });

    test("the bar track widens with the card", async () => {
      const trackWidth = async (id: string) => {
        const fill = surface(view, id).locator('[data-testid="analytics-bar-fill"]').first();
        return (await box(fill.locator("xpath=.."))).width;
      };
      expect(await trackWidth("c-bar-4x1")).toBeGreaterThan(await trackWidth("c-bar-1x1"));
    });

    test("a long automation name truncates instead of scrolling the row", async () => {
      await assertNoScroll(surface(view, "c-bar-1x1"), "narrow bar surface");
      const label = surface(view, "c-bar-2x1")
        .locator('[data-testid="analytics-bar-row"] > *')
        .first();
      const overflows = await label.evaluate((el) => el.scrollWidth > el.clientWidth);
      // Truncated, but the full text is still reachable.
      if (overflows) expect(await label.getAttribute("title")).toBeTruthy();
    });
  });

  test.describe("activity heatmap", () => {
    const heat = (id: string) => chartIn(view, id, "analytics-heatmap");
    const cellSize = async (id: string) => Number(await heat(id).getAttribute("data-heatmap-cell"));

    test("a larger widget produces larger cells", async () => {
      expect(await cellSize("c-heat-2x2")).toBeGreaterThan(await cellSize("c-heat-3x1"));
    });

    test("no longer sits at the old fixed tiny cell inside a large widget", async () => {
      expect(await cellSize("c-heat-2x2")).toBeGreaterThan(14);
      const [h, b] = [await box(heat("c-heat-2x2")), await box(surface(view, "c-heat-2x2"))];
      // It genuinely uses the widget, rather than sitting in a corner of it.
      expect(h.width * h.height).toBeGreaterThan(b.width * b.height * 0.3);
    });

    test("the whole matrix is inside the body, with square cells", async () => {
      for (const id of ["c-heat-3x1", "c-heat-2x2"]) {
        await assertInside(heat(id), body(view, id), `${id} matrix`);
        await assertNoScroll(surface(view, id), `${id} surface`);
        const rects = heat(id).locator("rect");
        expect(await rects.count()).toBe(16 * 7);
        for (const i of [0, 1, 50, 111]) {
          const r = await box(rects.nth(i));
          expect(Math.abs(r.width - r.height), `${id} cell ${i} square`).toBeLessThanOrEqual(1);
          await assertInside(rects.nth(i), heat(id), `${id} cell ${i}`);
        }
      }
    });

    test("the legend and summary stay visible", async () => {
      await expect(body(view, "c-heat-2x2").getByText("Less")).toBeVisible();
      await expect(body(view, "c-heat-2x2").getByText("More")).toBeVisible();
      await expect(body(view, "c-heat-2x2").getByText(/runs in the last 16 weeks/)).toBeVisible();
    });
  });
});

// ═══ Mutating: each test gets its own board ══════════════════════════════════

test.describe("resizing redraws the charts", () => {
  test.beforeEach(async ({ page }) => {
    resetDiagnostics();
    watch(page);
    await openHarness(page);
  });

  test.afterEach(() => assertClean());

  test("a narrowed card leaves no old-width sparkline artefact", async ({ page }) => {
    const spark = chartIn(page, "c-stat-1x1", "analytics-sparkline");
    const before = (await box(spark)).width;
    await showColumns(page, 1);
    const after = await box(spark);
    expect(after.width).toBeLessThan(before);
    await assertInside(spark, body(page, "c-stat-1x1"), "sparkline after narrowing");
  });

  test("the donut legend switches beside → beneath across the compact threshold", async ({
    page,
  }) => {
    const layout = () =>
      surface(page, "c-donut-2x1").locator('[data-testid="analytics-donut-layout"]');
    await expect(layout()).toHaveAttribute("data-donut-orientation", "side");
    await showColumns(page, 1);
    await expect(layout()).toHaveAttribute("data-donut-orientation", "stacked");
    await assertInside(
      chartIn(page, "c-donut-2x1", "analytics-donut"),
      body(page, "c-donut-2x1"),
      "stacked donut",
    );
    await assertNoScroll(surface(page, "c-donut-2x1"), "stacked donut surface");
  });

  test("heatmap cells shrink again when the widget gets smaller", async ({ page }) => {
    const heat = () => chartIn(page, "c-heat-2x2", "analytics-heatmap");
    const before = Number(await heat().getAttribute("data-heatmap-cell"));
    await showColumns(page, 1);
    expect(Number(await heat().getAttribute("data-heatmap-cell"))).toBeLessThan(before);
    await assertInside(heat(), body(page, "c-heat-2x2"), "narrow matrix");
  });

  test("an edit-mode preset change redraws the chart to the new body, no reload", async ({
    page,
  }) => {
    const svg = chartIn(page, "c-line-1x1", "analytics-line-chart");
    const before = await box(svg);
    expect(before.height).toBeLessThan(ROW);

    await page.getByRole("button", { name: /Edit dashboard/i }).click();
    await cell(page, "c-line-1x1").locator("select").selectOption({ label: "1×2" });

    // The footprint really changed…
    await expect
      .poll(async () => Math.round((await box(cell(page, "c-line-1x1"))).height))
      .toBe(2 * ROW + GAP);
    // …and the chart went with it, in the same page.
    await expect
      .poll(async () => Math.round((await box(svg)).height))
      .toBeGreaterThan(Math.round(before.height));
    await assertInside(svg, body(page, "c-line-1x1"), "line after growing");
    await assertNoScroll(surface(page, "c-line-1x1"), "line surface after growing");
  });

  test("shrinking a widget contracts the chart, leaving no stale SVG", async ({ page }) => {
    await page.getByRole("button", { name: /Edit dashboard/i }).click();
    const heat = () => chartIn(page, "c-heat-2x2", "analytics-heatmap");
    const before = Number(await heat().getAttribute("data-heatmap-cell"));
    await cell(page, "c-heat-2x2").locator("select").selectOption({ label: "2×1" });
    await expect
      .poll(async () => Number(await heat().getAttribute("data-heatmap-cell")))
      .toBeLessThan(before);
    await assertInside(heat(), body(page, "c-heat-2x2"), "heatmap after shrinking");
  });
});

test.describe("responsive projection", () => {
  test.beforeEach(async ({ page }) => {
    resetDiagnostics();
    watch(page);
    await openHarness(page);
  });

  test.afterEach(() => assertClean());

  const lineWidth = async (page: Page, id = "c-line-2x1") =>
    Math.round((await box(chartIn(page, id, "analytics-line-chart"))).width);

  test("charts redraw at 4 → 3 → 2 → 1 columns and every chart stays inside", async ({ page }) => {
    const widths: number[] = [];
    for (const columns of [4, 3, 2, 1] as const) {
      await showColumns(page, columns);
      widths.push(await lineWidth(page));
      for (const { id, chart } of CHART_WIDGETS) {
        const painted = chartIn(page, id, chart);
        await expect(painted, `${id} at ${columns} columns`).toBeVisible();
        await assertInside(painted, body(page, id), `${id} at ${columns} columns`);
        await assertNoScroll(surface(page, id), `${id} surface at ${columns} columns`);
      }
    }
    // Narrower projections really did give the chart a different width.
    expect(new Set(widths).size).toBeGreaterThan(1);
    expect(writes, "dashboard writes caused by projecting alone").toEqual([]);
  });

  test("a narrower projection really does give the chart a narrower body", async ({ page }) => {
    // A 3-wide widget is the honest comparison: a 2-wide one clamps to the whole
    // of a two-column grid, so its body barely changes between 4 and 2 columns.
    await showColumns(page, 4);
    const atFour = await lineWidth(page, "c-line-3x1");
    await showColumns(page, 1);
    expect(await lineWidth(page, "c-line-3x1")).toBeLessThan(atFour);
  });

  test("returning to four columns restores the original chart dimensions, with no write", async ({
    page,
  }) => {
    await showColumns(page, 4);
    const atFour = await lineWidth(page);
    await showColumns(page, 2);
    await showColumns(page, 1);
    await showColumns(page, 4);
    expect(await lineWidth(page)).toBe(atFour);
    expect(writes, "dashboard writes caused by resizing alone").toEqual([]);
  });

  test("charts stay canonical while the window narrows during an edit", async ({ page }) => {
    await showColumns(page, 4);
    await page.getByRole("button", { name: /Edit dashboard/i }).click();
    const svg = chartIn(page, "c-line-2x1", "analytics-line-chart");
    const before = Math.round((await box(svg)).width);
    const canonicalBefore = await cell(page, "c-line-2x1").getAttribute("data-canonical-x");

    // Narrow the window directly — `showColumns` polls for a reprojection, and
    // the point of the lock is that one must NOT happen.
    await page.setViewportSize({ width: MIN_CELL + 260, height: VIEWPORT.height });
    await page.waitForTimeout(300);
    await waitForCharts(page);
    expect(await gridColumns(page)).toBe(4);
    // The chart keeps a canonical-width body. The grid clamps to its canonical
    // minimum width and scrolls sideways rather than reflowing, so the body may
    // differ by a few pixels — what must NOT change is the coordinate space
    // being edited, or the chart's fit inside its card.
    expect(Math.abs(Math.round((await box(svg)).width) - before)).toBeLessThanOrEqual(12);
    expect(await cell(page, "c-line-2x1").getAttribute("data-canonical-x")).toBe(canonicalBefore);
    await expect(page.getByTestId("analytics-canonical-lock-notice")).toBeVisible();
    await assertInside(svg, body(page, "c-line-2x1"), "locked line chart");
    await assertNoScroll(surface(page, "c-line-2x1"), "locked line surface");
    expect(writes, "writes during the lock").toEqual([]);
  });
});
