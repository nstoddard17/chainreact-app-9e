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
