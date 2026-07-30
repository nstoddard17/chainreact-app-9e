import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Analytics explicit-layout geometry and pointer behaviour, in a real browser
 * (ANALYTICS-EXPLICIT-LAYOUT-S4-EDITOR-INTEGRATION-1).
 *
 * Backend-free: `/dev-drag-harness` mounts the REAL AnalyticsDashboard with
 * in-memory widgets, so no Supabase, no auth, no database, no public route. See
 * `playwright.analytics.config.ts`.
 *
 * These assertions are the ones jsdom cannot make: it neither lays out CSS Grid
 * nor implements PointerEvent, so the unit suite proves the INSTRUCTIONS are
 * right while this proves the browser turns them into the right pixels and that
 * a real gesture behaves.
 *
 * The harness board (explicit placement, mixed sizes, one deliberate hole):
 *
 *   row 0:  Alpha | Bravo |   ·   | Delta
 *   row 1:  Charlie(2x1)  | Echo(2x2)
 *   row 2:        ·       | Echo
 */

const ROW = 190;
const GAP = 14;

const cell = (page: Page, id: string) => page.getByTestId(`analytics-grid-cell-${id}`);
const grip = (page: Page, id: string) => page.getByTestId(`analytics-widget-drag-handle-${id}`);
const placeholder = (page: Page) => page.locator('[data-testid^="analytics-grid-placeholder"]');

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
}

/** The rectangle a cell claims, read from the attributes the renderer mirrors. */
async function rect(page: Page, id: string): Promise<string> {
  const el = cell(page, id);
  const [x, y, w, h] = await Promise.all([
    el.getAttribute("data-grid-x"),
    el.getAttribute("data-grid-y"),
    el.getAttribute("data-grid-w"),
    el.getAttribute("data-grid-h"),
  ]);
  return `${x},${y},${w},${h}`;
}

async function enterEdit(page: Page) {
  await page.getByRole("button", { name: /Edit dashboard/i }).click();
  await expect(grip(page, "w-alpha")).toBeVisible();
}

/** Drag a widget's grip to the centre of a target cell, in steps. */
async function dragTo(page: Page, id: string, target: { x: number; y: number }) {
  const grid = await box(page.getByTestId("analytics-explicit-grid"));
  const columnPitch = (grid.width - GAP * 3) / 4 + GAP;
  const handle = await box(grip(page, id));
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  const toX = grid.x + target.x * columnPitch + 20;
  const toY = grid.y + target.y * (ROW + GAP) + 20;
  // Several steps so the session sees real intermediate moves.
  await page.mouse.move(toX, toY, { steps: 12 });
  return { toX, toY };
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/dev-drag-harness");
  await expect(page.getByTestId("analytics-explicit-grid")).toBeVisible();
});

test.describe("geometry", () => {
  test("a 1×1 occupies exactly one row, and columns are even", async ({ page }) => {
    const alpha = await box(cell(page, "w-alpha"));
    const bravo = await box(cell(page, "w-bravo"));
    expect(Math.round(alpha.height)).toBe(ROW);
    expect(Math.round(bravo.width)).toBe(Math.round(alpha.width));
    // One column pitch apart: track width plus the gap.
    expect(Math.round(bravo.x - alpha.x)).toBe(Math.round(alpha.width + GAP));
  });

  test("a 2×1 spans two columns plus the gap between them", async ({ page }) => {
    const alpha = await box(cell(page, "w-alpha"));
    const charlie = await box(cell(page, "w-charlie"));
    expect(Math.round(charlie.width)).toBe(Math.round(alpha.width * 2 + GAP));
    expect(Math.round(charlie.height)).toBe(ROW);
  });

  test("a 2×2 spans two rows plus the gap between them", async ({ page }) => {
    const echo = await box(cell(page, "w-echo"));
    expect(Math.round(echo.height)).toBe(ROW * 2 + GAP);
  });

  test("the deliberate hole at row 0 column 2 stays empty", async ({ page }) => {
    const alpha = await box(cell(page, "w-alpha"));
    const pitch = alpha.width + GAP;
    const holeCentreX = alpha.x + 2 * pitch + alpha.width / 2;
    const holeCentreY = alpha.y + ROW / 2;
    const occupant = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x as number, y as number);
        return el?.closest("[data-widget-id]")?.getAttribute("data-widget-id") ?? null;
      },
      [holeCentreX, holeCentreY],
    );
    expect(occupant).toBeNull();
  });
});

test.describe("pointer alignment", () => {
  test("the overlay stays under the grabbed point while moving right", async ({ page }) => {
    await enterEdit(page);
    const handle = await box(grip(page, "w-alpha"));
    const card = await box(cell(page, "w-alpha"));
    const grabX = handle.x + handle.width / 2;
    const grabY = handle.y + handle.height / 2;
    const offsetX = grabX - card.x;
    const offsetY = grabY - card.y;

    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX + 420, grabY + 60, { steps: 10 });

    const overlay = await box(page.getByTestId("analytics-drag-overlay"));
    expect(Math.round(grabX + 420 - overlay.x)).toBe(Math.round(offsetX));
    expect(Math.round(grabY + 60 - overlay.y)).toBe(Math.round(offsetY));
    await page.mouse.up();
  });

  test("moving right does not release the drag early", async ({ page }) => {
    await enterEdit(page);
    await dragTo(page, "w-alpha", { x: 2, y: 0 });
    // Still dragging after crossing sibling cards and the gap.
    await expect(page.getByTestId("analytics-drag-overlay")).toBeVisible();
    await page.mouse.up();
    expect(await rect(page, "w-alpha")).toBe("2,0,1,1");
  });

  test("moving left keeps pointer capture", async ({ page }) => {
    await enterEdit(page);
    await dragTo(page, "w-delta", { x: 0, y: 2 });
    await expect(page.getByTestId("analytics-drag-overlay")).toBeVisible();
    await page.mouse.up();
    expect(await rect(page, "w-delta")).toBe("0,2,1,1");
  });
});

test.describe("targeting a place, not a card", () => {
  test("drops into the empty cell, and the placeholder previewed it", async ({ page }) => {
    await enterEdit(page);
    await dragTo(page, "w-alpha", { x: 2, y: 0 });
    await expect(placeholder(page)).toHaveAttribute("data-grid-x", "2");
    await expect(placeholder(page)).toHaveAttribute("data-grid-y", "0");
    await page.mouse.up();
    expect(await rect(page, "w-alpha")).toBe("2,0,1,1");
    // Nothing else moved: the hole was empty, so no collision occurred.
    expect(await rect(page, "w-bravo")).toBe("1,0,1,1");
    expect(await rect(page, "w-delta")).toBe("3,0,1,1");
  });

  test("drops onto a new row below the board", async ({ page }) => {
    await enterEdit(page);
    await dragTo(page, "w-alpha", { x: 0, y: 3 });
    await expect(placeholder(page)).toHaveAttribute("data-grid-y", "3");
    await page.mouse.up();
    expect(await rect(page, "w-alpha")).toBe("0,3,1,1");
  });

  test("a small widget dropped into a 2×2 pushes it down", async ({ page }) => {
    await enterEdit(page);
    await dragTo(page, "w-alpha", { x: 2, y: 1 });
    await expect(placeholder(page)).toHaveAttribute("data-grid-x", "2");
    await page.mouse.up();
    expect(await rect(page, "w-alpha")).toBe("2,1,1,1");
    // Echo cleared the collision by moving DOWN, keeping its column.
    expect(await rect(page, "w-echo")).toBe("2,2,2,2");
  });

  test("a wide widget dropped onto two small ones pushes both down", async ({ page }) => {
    await enterEdit(page);
    await dragTo(page, "w-charlie", { x: 0, y: 0 });
    await page.mouse.up();
    expect(await rect(page, "w-charlie")).toBe("0,0,2,1");
    expect(await rect(page, "w-alpha")).toBe("0,1,1,1");
    expect(await rect(page, "w-bravo")).toBe("1,1,1,1");
    expect(await rect(page, "w-delta")).toBe("3,0,1,1"); // outside the chain
  });

  test("moving through a collision and back restores the drag-start layout", async ({ page }) => {
    await enterEdit(page);
    const before = await Promise.all(
      ["w-alpha", "w-bravo", "w-charlie", "w-echo"].map((id) => rect(page, id)),
    );
    const grid = await box(page.getByTestId("analytics-explicit-grid"));
    const alpha = await box(cell(page, "w-alpha"));
    const pitch = alpha.width + GAP;
    const handle = await box(grip(page, "w-alpha"));
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    // Over Echo (a real collision), then back to the origin.
    await page.mouse.move(grid.x + 2 * pitch + 20, grid.y + (ROW + GAP) + 20, { steps: 10 });
    await expect(placeholder(page)).toHaveAttribute("data-grid-y", "1");
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    const after = await Promise.all(
      ["w-alpha", "w-bravo", "w-charlie", "w-echo"].map((id) => rect(page, id)),
    );
    expect(after).toEqual(before);
  });
});

test.describe("cancellation", () => {
  test("Escape restores the drag-start layout and clears the overlay", async ({ page }) => {
    await enterEdit(page);
    const before = await rect(page, "w-echo");
    await dragTo(page, "w-alpha", { x: 2, y: 1 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("analytics-drag-overlay")).toHaveCount(0);
    await expect(placeholder(page)).toHaveCount(0);
    expect(await rect(page, "w-alpha")).toBe("0,0,1,1");
    expect(await rect(page, "w-echo")).toBe(before);
    await page.mouse.up();
  });

  test("the placeholder footprint always matches the dragged widget", async ({ page }) => {
    await enterEdit(page);
    await dragTo(page, "w-echo", { x: 0, y: 3 });
    await expect(placeholder(page)).toHaveAttribute("data-grid-w", "2");
    await expect(placeholder(page)).toHaveAttribute("data-grid-h", "2");
    const ph = await box(placeholder(page));
    expect(Math.round(ph.height)).toBe(ROW * 2 + GAP);
    await page.mouse.up();
  });
});

/**
 * Responsive projection (ANALYTICS-EXPLICIT-LAYOUT-S5-RESPONSIVE-PROJECTION-1).
 *
 * One layout is persisted; narrow screens get a derived picture. These cases
 * prove the browser really repacks, that the canonical rectangles survive the
 * round trip, and that a resize never turns into a save.
 */

/**
 * Resize the window until the GRID CONTAINER is wide enough for `columns`.
 *
 * The viewport is not the container — the harness's sidebar spacer and the
 * page's padding sit between them — so the chrome width is MEASURED once and
 * the target viewport derived from it, rather than guessed.
 */
const MIN_CELL = 220;
const gridColumns = (page: Page) =>
  page
    .getByTestId("analytics-explicit-grid")
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);

async function useColumns(page: Page, columns: 1 | 2 | 3 | 4) {
  const probeViewport = 1600;
  await page.setViewportSize({ width: probeViewport, height: 1200 });
  const gridWidth = (await box(page.getByTestId("analytics-explicit-grid"))).width;
  const chrome = probeViewport - gridWidth;
  // The narrowest container that still shows `columns`, plus a little slack.
  const wantedGrid = columns * MIN_CELL + (columns - 1) * GAP + 8;
  await page.setViewportSize({ width: Math.round(wantedGrid + chrome), height: 1200 });
  await expect.poll(() => gridColumns(page)).toBe(columns);
}

async function canonicalRect(page: Page, id: string): Promise<string> {
  const el = cell(page, id);
  const [x, y, w, h] = await Promise.all([
    el.getAttribute("data-canonical-x"),
    el.getAttribute("data-canonical-y"),
    el.getAttribute("data-canonical-w"),
    el.getAttribute("data-canonical-h"),
  ]);
  return `${x},${y},${w},${h}`;
}

const ALL_WIDGETS = ["w-alpha", "w-bravo", "w-delta", "w-charlie", "w-echo"];

test.describe("responsive projection", () => {
  test("four columns keeps the canonical board and its deliberate gap", async ({ page }) => {
    await useColumns(page, 4);
    expect(await rect(page, "w-echo")).toBe("2,1,2,2");
    const alpha = await box(cell(page, "w-alpha"));
    const occupant = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x as number, y as number);
        return el?.closest("[data-widget-id]")?.getAttribute("data-widget-id") ?? null;
      },
      [alpha.x + 2 * (alpha.width + GAP) + alpha.width / 2, alpha.y + ROW / 2],
    );
    expect(occupant).toBeNull();
    await expect(page.getByRole("button", { name: /Edit dashboard/i })).toBeEnabled();
  });

  test("three columns repacks, keeps every widget and disables editing", async ({ page }) => {
    await useColumns(page, 3);
    for (const id of ALL_WIDGETS) await expect(cell(page, id)).toBeVisible();
    // The 2-wide Charlie still fits; Echo keeps its two-row height.
    expect(await rect(page, "w-echo")).toMatch(/,2,2$/);
    await expect(page.getByRole("button", { name: /Edit dashboard/i })).toBeDisabled();
    await expect(page.getByTestId("analytics-widget-drag-handle-w-alpha")).toHaveCount(0);
    await expect(placeholder(page)).toHaveCount(0);
  });

  test("two columns clamps wide widgets and keeps the 2×2 two rows tall", async ({ page }) => {
    await useColumns(page, 2);
    for (const id of ALL_WIDGETS) await expect(cell(page, id)).toBeVisible();
    const echo = await box(cell(page, "w-echo"));
    expect(Math.round(echo.height)).toBe(ROW * 2 + GAP);
    const charlie = await box(cell(page, "w-charlie"));
    const grid = await box(page.getByTestId("analytics-explicit-grid"));
    expect(Math.round(charlie.width)).toBe(Math.round(grid.width));
    await expect(page.getByRole("button", { name: /Edit dashboard/i })).toBeDisabled();
  });

  test("one column stacks everything full width, in canonical reading order", async ({ page }) => {
    await useColumns(page, 1);
    const grid = await box(page.getByTestId("analytics-explicit-grid"));
    for (const id of ALL_WIDGETS) {
      const b = await box(cell(page, id));
      expect(Math.round(b.width)).toBe(Math.round(grid.width));
    }
    expect(Math.round((await box(cell(page, "w-echo"))).height)).toBe(ROW * 2 + GAP);
    const order = await page
      .locator("[data-testid^='analytics-grid-cell-']")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-widget-id")));
    expect(order).toEqual(["w-alpha", "w-bravo", "w-delta", "w-charlie", "w-echo"]);
    // No sideways scrolling of the BOARD in ordinary view mode. Scoped to the
    // grid surface: the harness wraps the page in a fixed-width sidebar
    // stand-in, so document-level overflow is the fixture's, not the product's.
    const surfaceOverflow = await page
      .getByTestId("analytics-grid-surface")
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(surfaceOverflow).toBeLessThanOrEqual(1);
  });

  test("narrowing and widening restores every canonical rectangle, with no save", async ({
    page,
  }) => {
    const saves: string[] = [];
    await page.route("**/api/analytics/**", (route) => {
      if (route.request().method() !== "GET") saves.push(route.request().method());
      return route.continue();
    });
    await useColumns(page, 4);
    const before = await Promise.all(ALL_WIDGETS.map((id) => rect(page, id)));
    await useColumns(page, 2);
    expect(await Promise.all(ALL_WIDGETS.map((id) => canonicalRect(page, id)))).toEqual(before);
    await useColumns(page, 4);
    expect(await Promise.all(ALL_WIDGETS.map((id) => rect(page, id)))).toEqual(before);
    expect(saves).toEqual([]);
  });

  test("an open edit session stays canonical while the window narrows", async ({ page }) => {
    await useColumns(page, 4);
    await enterEdit(page);
    const before = await Promise.all(ALL_WIDGETS.map((id) => rect(page, id)));

    await page.setViewportSize({ width: 700, height: 1200 });
    // Still four columns — the board must not move under the pointer.
    await expect.poll(() => gridColumns(page)).toBe(4);
    expect(await Promise.all(ALL_WIDGETS.map((id) => rect(page, id)))).toEqual(before);
    await expect(page.getByTestId("analytics-canonical-lock-notice")).toBeVisible();
    const overflowX = await page
      .getByTestId("analytics-grid-surface")
      .evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflowX).toBe("auto");

    await page.getByTestId("analytics-cancel-editing").click();
    // Responsive projection resumes once the session ends.
    await expect.poll(() => gridColumns(page)).toBeLessThan(4);
  });
});
