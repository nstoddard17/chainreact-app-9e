import { test, expect, type Page } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  signInViaEmailLink,
  type TestUser,
} from "./helpers/supabaseAdmin";

/**
 * ANALYTICS-DRAG-COORDINATE-SPACE-REPAIR-1 — REAL-BROWSER certification of the
 * edit-mode widget drag.
 *
 * The jsdom suite could not catch the coordinate-space bug this spec exists
 * for: jsdom has no layout, so that harness stamps every rect and offset by
 * hand and can only prove the numbers are combined the way the harness itself
 * assumes. Only a real browser decides what `offsetParent` is, what
 * `offsetLeft` is measured from, and where a `position: fixed` element lands.
 *
 * The bug: slot boxes were built from `offsetLeft/offsetTop` (document-space,
 * because the grid was not a positioned ancestor) and compared against
 * grid-local pointer coordinates, while the overlay was placed at
 * `gridRect + offsetLeft` — double-counting the grid's own origin. The ghost
 * sat hundreds of pixels down-and-right of the cursor and no pointer position
 * could ever land inside a slot.
 *
 * Every assertion below is made from REAL layout geometry read out of the
 * browser, and every gesture is REAL mouse input.
 */

const state: { owner: TestUser | null } = { owner: null };

/** Widget cards, in DOM order — what CSS grid auto-places from. */
async function order(page: Page): Promise<string[]> {
  return page.locator("[data-widget-id]").evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).dataset.widgetId as string),
  );
}

async function boxOf(page: Page, testid: string) {
  const box = await page.getByTestId(testid).boundingBox();
  if (!box) throw new Error(`no bounding box for ${testid}`);
  return box;
}

async function openAnalytics(page: Page, user: TestUser): Promise<void> {
  await signInViaEmailLink(page, user, { next: "/analytics" });
  await expect(page.getByRole("heading", { name: "How everything's going" })).toBeVisible({
    timeout: 20_000,
  });
}

async function enterEdit(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Edit dashboard" }).click();
  await expect(page.getByText("Edit mode is on.")).toBeVisible();
}

/** The ids of the first two cards, and their real on-screen boxes. */
async function firstTwo(page: Page) {
  const ids = await order(page);
  const [a, b] = ids;
  if (!a || !b) throw new Error("need at least two widgets to test a reorder");
  return {
    a,
    b,
    boxA: await boxOf(page, `analytics-widget-${a}`),
    boxB: await boxOf(page, `analytics-widget-${b}`),
    ids,
  };
}

const centre = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.beforeAll(async () => {
  state.owner = await createTestUser();
});

test.afterAll(async () => {
  if (state.owner) await deleteTestUser(state.owner.id);
});

test("the overlay stays under the grabbed point of the pointer", async ({ page }) => {
  const user = state.owner;
  if (!user) throw new Error("test user setup failed");
  await openAnalytics(page, user);
  await enterEdit(page);

  const { a } = await firstTwo(page);
  const grip = await boxOf(page, `analytics-widget-drag-handle-${a}`);
  const cardBefore = await boxOf(page, `analytics-widget-${a}`);

  // Press at a known point inside the grip, deliberately off its centre so a
  // dropped or doubled grab offset cannot cancel out.
  const pressX = grip.x + grip.width * 0.25;
  const pressY = grip.y + grip.height * 0.75;
  await page.mouse.move(pressX, pressY);
  await page.mouse.down();

  // Where inside the CARD the press landed — the grab offset the overlay owes.
  const grabOffsetX = pressX - cardBefore.x;
  const grabOffsetY = pressY - cardBefore.y;

  const overlay = page.getByTestId("analytics-drag-overlay");
  await expect(overlay).toBeVisible();

  // Move by a known delta and confirm the grabbed point is still under the mouse.
  const targetX = pressX + 180;
  const targetY = pressY + 60;
  await page.mouse.move(targetX, targetY, { steps: 12 });

  const overlayBox = await boxOf(page, "analytics-drag-overlay");
  expect(Math.abs(overlayBox.x + grabOffsetX - targetX)).toBeLessThanOrEqual(3);
  expect(Math.abs(overlayBox.y + grabOffsetY - targetY)).toBeLessThanOrEqual(3);

  await page.mouse.up();
});

test("destination, move-back, stillness and drop all follow the real pointer", async ({
  page,
}) => {
  const user = state.owner;
  if (!user) throw new Error("test user setup failed");
  await openAnalytics(page, user);
  await enterEdit(page);

  const { a, b, boxA, boxB, ids } = await firstTwo(page);
  const originalOrder = [...ids];

  const grip = await boxOf(page, `analytics-widget-drag-handle-${a}`);
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();

  // ── Destination follows the pointer into the SECOND card's original box ──
  const bCentre = centre(boxB);
  await page.mouse.move(bCentre.x, bCentre.y, { steps: 15 });

  await expect
    .poll(async () => (await order(page)).slice(0, 2).join(","))
    .toBe(`${b},${a}`);
  // The blue placeholder is the dragged card, and it now occupies slot 1.
  await expect(page.getByTestId(`analytics-drag-placeholder-${a}`)).toBeVisible();
  // The displaced card moved into the vacated slot.
  const bAfter = await boxOf(page, `analytics-widget-${b}`);
  expect(Math.abs(bAfter.x - boxA.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(bAfter.y - boxA.y)).toBeLessThanOrEqual(2);

  // ── Move back into the ORIGINAL slot, without releasing ──
  const aCentre = centre(boxA);
  await page.mouse.move(aCentre.x, aCentre.y, { steps: 15 });
  await expect
    .poll(async () => (await order(page)).slice(0, 2).join(","))
    .toBe(`${a},${b}`);

  // ── Hold still: nothing may move ──
  const settled = await order(page);
  const settledPlaceholder = await boxOf(page, `analytics-drag-placeholder-${a}`);
  await page.waitForTimeout(1_000);
  expect(await order(page)).toEqual(settled);
  const stillPlaceholder = await boxOf(page, `analytics-drag-placeholder-${a}`);
  expect(Math.abs(stillPlaceholder.x - settledPlaceholder.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(stillPlaceholder.y - settledPlaceholder.y)).toBeLessThanOrEqual(1);

  // ── Move over again and release: the commit is exactly the visible preview ──
  await page.mouse.move(bCentre.x, bCentre.y, { steps: 15 });
  await expect
    .poll(async () => (await order(page)).slice(0, 2).join(","))
    .toBe(`${b},${a}`);
  const previewed = await order(page);
  await page.mouse.up();

  expect(await order(page)).toEqual(previewed);
  expect(previewed).not.toEqual(originalOrder);
  await expect(page.getByTestId("analytics-drag-overlay")).toHaveCount(0);
  await expect(page.getByTestId(`analytics-drag-placeholder-${a}`)).toHaveCount(0);

  // ── Post-drop hover changes nothing ──
  const committed = await order(page);
  await page.mouse.move(aCentre.x, aCentre.y, { steps: 10 });
  await page.mouse.move(bCentre.x, bCentre.y, { steps: 10 });
  expect(await order(page)).toEqual(committed);
  await expect(page.getByTestId("analytics-drag-overlay")).toHaveCount(0);
  expect(await page.locator("[data-testid^='analytics-drag-placeholder']").count()).toBe(0);
});

/**
 * The whole point of the repair: viewport and grid-local coordinates are NOT
 * interchangeable. Each variant moves the grid to a different place relative to
 * the viewport origin, so a formula that silently assumes they are identical
 * fails here even when it passes at the default position.
 */
const VARIANTS: { name: string; prepare: (page: Page) => Promise<void> }[] = [
  {
    name: "after scrolling the page vertically",
    prepare: async (page) => {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(300);
    },
  },
  {
    name: "at a narrower viewport, where the grid starts at a different x",
    prepare: async (page) => {
      await page.setViewportSize({ width: 900, height: 900 });
      await page.waitForTimeout(300);
    },
  },
  {
    name: "with a taller widget pushing later rows down",
    prepare: async (page) => {
      const ids = await order(page);
      const last = ids[ids.length - 1];
      if (!last) return;
      await page
        .getByTestId(`analytics-widget-${last}`)
        .getByLabel("Resize widget")
        .selectOption("l");
      await page.waitForTimeout(300);
    },
  },
];

for (const variant of VARIANTS) {
  test(`overlay and destination stay correct ${variant.name}`, async ({ page }) => {
    const user = state.owner;
    if (!user) throw new Error("test user setup failed");
    await openAnalytics(page, user);
    await enterEdit(page);
    await variant.prepare(page);

    const { a, b, boxB } = await firstTwo(page);
    const grip = await boxOf(page, `analytics-widget-drag-handle-${a}`);
    const cardBefore = await boxOf(page, `analytics-widget-${a}`);

    const pressX = grip.x + grip.width * 0.3;
    const pressY = grip.y + grip.height * 0.6;
    await page.mouse.move(pressX, pressY);
    await page.mouse.down();
    const grabOffsetX = pressX - cardBefore.x;
    const grabOffsetY = pressY - cardBefore.y;

    // Overlay tracks the pointer in VIEWPORT space...
    const bCentre = centre(boxB);
    await page.mouse.move(bCentre.x, bCentre.y, { steps: 15 });
    const overlayBox = await boxOf(page, "analytics-drag-overlay");
    expect(Math.abs(overlayBox.x + grabOffsetX - bCentre.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(overlayBox.y + grabOffsetY - bCentre.y)).toBeLessThanOrEqual(3);

    // ...and the destination resolves in GRID-LOCAL space.
    await expect
      .poll(async () => (await order(page)).slice(0, 2).join(","))
      .toBe(`${b},${a}`);

    await page.mouse.up();
    expect((await order(page)).slice(0, 2)).toEqual([b, a]);

    // Restore the viewport for later tests in the file.
    await page.setViewportSize({ width: 1280, height: 720 });
  });
}

test("card controls do not start a drag", async ({ page }) => {
  const user = state.owner;
  if (!user) throw new Error("test user setup failed");
  await openAnalytics(page, user);
  await enterEdit(page);

  const { a } = await firstTwo(page);
  const card = page.getByTestId(`analytics-widget-${a}`);
  const before = await order(page);

  // Press-and-drag from the card BODY (not the grip): nothing may move.
  const body = await boxOf(page, `analytics-widget-${a}`);
  await page.mouse.move(body.x + body.width / 2, body.y + body.height - 20);
  await page.mouse.down();
  await page.mouse.move(body.x + body.width * 2, body.y + body.height - 20, { steps: 10 });
  await expect(page.getByTestId("analytics-drag-overlay")).toHaveCount(0);
  await page.mouse.up();
  expect(await order(page)).toEqual(before);

  // The resize control still works and still does not drag.
  await card.getByLabel("Resize widget").selectOption("m");
  await expect(page.getByTestId("analytics-drag-overlay")).toHaveCount(0);
});
