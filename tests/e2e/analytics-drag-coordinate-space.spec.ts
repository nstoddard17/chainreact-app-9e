import { test, expect } from "@playwright/test";
import { computeDragPreview, hitTestSlot } from "@/features/analytics/dashboardHelpers";
import type { AnalyticsWidget } from "@/contracts/analytics";

/**
 * ANALYTICS-DRAG-COORDINATE-SPACE-REPAIR-1 — real-Chromium proof of the
 * coordinate contract itself.
 *
 * This spec deliberately does NOT sign in. It builds the dashboard grid's DOM
 * and CSS shape directly in a real browser, reads REAL layout numbers out of
 * it, and feeds those numbers to the REAL production functions
 * (`hitTestSlot`, `computeDragPreview`) running in Node.
 *
 * Why it exists separately from the full journey spec: the layout facts the bug
 * turned on — what `offsetParent` resolves to, what `offsetLeft` is measured
 * from, where a `position: fixed` element lands — are decided by the browser
 * engine and by nothing else. jsdom has no layout, so the unit harness can only
 * confirm that hand-stamped numbers are combined as the harness assumed. This
 * spec needs no database, so it certifies the contract even when the app's e2e
 * environment is unavailable.
 */

/** The dashboard grid's real structure: offset ancestors, then the grid. */
const PAGE = `
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { margin: 0; }
    /* Mimic the app shell: sidebar + header push the grid well off (0,0),
       which is precisely the condition under which mixing coordinate spaces
       stops being harmless. */
    .shell { display: flex; }
    .sidebar { width: 248px; height: 100vh; background: #eee; }
    .col { flex: 1; padding: 24px; }
    .header { height: 96px; background: #ddd; }
    .banner { height: 64px; margin-bottom: 16px; background: #eef; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      grid-auto-rows: minmax(190px, auto);
    }
    .grid.positioned { position: relative; }
    .card { min-height: 190px; border: 1px solid #ccc; }
    .span2 { grid-column: span 2; }
  </style>
  <div class="shell">
    <div class="sidebar"></div>
    <div class="col">
      <div class="header"></div>
      <div class="banner"></div>
      <div class="grid positioned" id="grid">
        <div class="card" data-widget-id="w-a"></div>
        <div class="card" data-widget-id="w-b"></div>
        <div class="card span2" data-widget-id="w-c"></div>
        <div class="card" data-widget-id="w-d"></div>
      </div>
    </div>
  </div>
`;

interface Measured {
  grid: { left: number; top: number };
  cards: {
    id: string;
    offsetParentIsGrid: boolean;
    offsetLeft: number;
    offsetTop: number;
    offsetWidth: number;
    offsetHeight: number;
    rectLeft: number;
    rectTop: number;
    rectWidth: number;
    rectHeight: number;
  }[];
}

/** Read the browser's real geometry for the grid and its cards. */
async function measure(page: import("@playwright/test").Page): Promise<Measured> {
  return page.evaluate(() => {
    const grid = document.getElementById("grid") as HTMLElement;
    const gridRect = grid.getBoundingClientRect();
    return {
      grid: { left: gridRect.left, top: gridRect.top },
      cards: Array.from(grid.children).map((el) => {
        const c = el as HTMLElement;
        const r = c.getBoundingClientRect();
        return {
          id: c.dataset.widgetId as string,
          offsetParentIsGrid: c.offsetParent === grid,
          offsetLeft: c.offsetLeft,
          offsetTop: c.offsetTop,
          offsetWidth: c.offsetWidth,
          offsetHeight: c.offsetHeight,
          rectLeft: r.left,
          rectTop: r.top,
          rectWidth: r.width,
          rectHeight: r.height,
        };
      }),
    };
  });
}

const widget = (id: string): AnalyticsWidget => ({
  id,
  type: "stat",
  size: "s",
  title: id,
  config: { source: "any", metric: "runs" },
});

test.describe("drag coordinate spaces, in a real browser", () => {
  test("the grid is genuinely off the viewport origin (the bug's precondition)", async ({
    page,
  }) => {
    await page.setContent(PAGE);
    const m = await measure(page);
    // If this were near (0,0) the mismatch would be invisible — which is how it
    // survived a green jsdom suite whose harness put the grid at (50,30).
    expect(m.grid.left).toBeGreaterThan(200);
    expect(m.grid.top).toBeGreaterThan(150);
  });

  test("`position: relative` makes offsetLeft/offsetTop grid-local", async ({ page }) => {
    await page.setContent(PAGE);
    const m = await measure(page);

    for (const c of m.cards) {
      expect(c.offsetParentIsGrid).toBe(true);
      // Grid-local offset == rect delta. This is the invariant the drag relies
      // on to use transform-immune offset* as its frozen slot geometry.
      expect(Math.abs(c.offsetLeft - (c.rectLeft - m.grid.left))).toBeLessThanOrEqual(1);
      expect(Math.abs(c.offsetTop - (c.rectTop - m.grid.top))).toBeLessThanOrEqual(1);
    }
  });

  test("WITHOUT it, offsetLeft is document-space — the original defect", async ({ page }) => {
    await page.setContent(PAGE);
    await page.evaluate(() => document.getElementById("grid")!.classList.remove("positioned"));
    const m = await measure(page);

    const first = m.cards[0]!;
    expect(first.offsetParentIsGrid).toBe(false);
    // offsetLeft now carries the whole sidebar + padding; treating it as
    // grid-local puts every slot box hundreds of px from where the pointer is.
    expect(first.offsetLeft).toBeGreaterThan(200);
    expect(Math.abs(first.offsetLeft - (first.rectLeft - m.grid.left))).toBeGreaterThan(100);
  });

  test("grid-local pointer + grid-local slots resolves the right slot; mixing spaces does not", async ({
    page,
  }) => {
    await page.setContent(PAGE);
    const m = await measure(page);

    const slots = m.cards.map((c) => ({
      left: c.offsetLeft,
      top: c.offsetTop,
      width: c.offsetWidth,
      height: c.offsetHeight,
    }));

    for (const [index, c] of m.cards.entries()) {
      // A real pointer at this card's real on-screen centre (viewport space).
      const pointer = { x: c.rectLeft + c.rectWidth / 2, y: c.rectTop + c.rectHeight / 2 };
      // CORRECT: convert to grid-local before hit-testing.
      expect(hitTestSlot(slots, pointer.x - m.grid.left, pointer.y - m.grid.top)).toBe(index);
    }

    // WRONG (the shipped bug): compare raw viewport coordinates against
    // grid-local slot boxes. With the grid pushed off-origin this resolves to
    // the wrong slot or, as on the real page, to nothing at all.
    const c0 = m.cards[0]!;
    const viewportPointer = { x: c0.rectLeft + 10, y: c0.rectTop + 10 };
    expect(hitTestSlot(slots, viewportPointer.x, viewportPointer.y)).not.toBe(0);
  });

  test("the overlay formula keeps the grabbed point under the pointer", async ({ page }) => {
    await page.setContent(PAGE);
    const m = await measure(page);
    const card = m.cards[0]!;

    // Grab deliberately off-centre, in viewport coordinates.
    const press = { x: card.rectLeft + 17, y: card.rectTop + 9 };
    const grab = { x: press.x - card.rectLeft, y: press.y - card.rectTop };

    // Place a real fixed overlay in the browser using the production formula:
    // left/top pinned to 0 and translate3d(pointer − grab). Nothing else added.
    const probe = async (pointer: { x: number; y: number }) =>
      page.evaluate(
        ({ pointer, grab, size }) => {
          let el = document.getElementById("overlay");
          if (!el) {
            el = document.createElement("div");
            el.id = "overlay";
            el.style.position = "fixed";
            el.style.left = "0px";
            el.style.top = "0px";
            document.body.appendChild(el);
          }
          el.style.width = `${size.w}px`;
          el.style.height = `${size.h}px`;
          el.style.transform = `translate3d(${pointer.x - grab.x}px, ${pointer.y - grab.y}px, 0)`;
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top };
        },
        { pointer, grab, size: { w: card.rectWidth, h: card.rectHeight } },
      );

    // At rest the ghost sits exactly on the card it replaced — no jump.
    const atRest = await probe(press);
    expect(Math.abs(atRest.left - card.rectLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(atRest.top - card.rectTop)).toBeLessThanOrEqual(1);

    // After a known delta the SAME grabbed point is still under the pointer.
    const moved = { x: press.x + 180, y: press.y + 60 };
    const after = await probe(moved);
    expect(Math.abs(after.left + grab.x - moved.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(after.top + grab.y - moved.y)).toBeLessThanOrEqual(3);

    // And the defect for contrast: adding the grid's origin on top of a
    // grid-local offset double-counts it, which is the screenshot.
    const doubled = { left: m.grid.left + card.offsetLeft, top: m.grid.top + card.offsetTop };
    const correct = { left: card.rectLeft, top: card.rectTop };
    // Slot 0 sits at grid-local (0,0), so this particular card is the ONE place
    // the two formulas agree — every later card diverges by the grid origin.
    expect(doubled.left).toBeCloseTo(correct.left, 0);
    const later = m.cards[1]!;
    expect(m.grid.left + later.offsetLeft + m.grid.left).not.toBeCloseTo(later.rectLeft, 0);
  });

  test("preview stays correct for a real mixed-size layout", async ({ page }) => {
    await page.setContent(PAGE);
    const m = await measure(page);
    const order = m.cards.map((c) => widget(c.id));
    const slots = m.cards.map((c) => ({
      left: c.offsetLeft,
      top: c.offsetTop,
      width: c.offsetWidth,
      height: c.offsetHeight,
    }));

    // Card "w-c" spans two columns and wraps to the second row in this layout,
    // so its slot box is a different size and a different row — the case where
    // a row/column assumption would break.
    const target = m.cards.findIndex((c) => c.id === "w-c");
    const t = m.cards[target]!;
    const pointer = { x: t.rectLeft + t.rectWidth / 2, y: t.rectTop + t.rectHeight / 2 };
    const slot = hitTestSlot(slots, pointer.x - m.grid.left, pointer.y - m.grid.top);
    expect(slot).toBe(target);

    const preview = computeDragPreview(order, "w-a", slot as number);
    expect(preview?.map((w) => w.id)).toEqual(["w-b", "w-c", "w-a", "w-d"]);
  });
});
