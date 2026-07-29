import { test, expect, type Page } from "@playwright/test";

/**
 * ANALYTICS-DRAG-RIGHTWARD-CAPTURE-LOSS-1 — real Chromium coverage of the drag
 * SESSION (not just its geometry), against the backend-free harness route.
 *
 * What only a browser can prove, and what the jsdom suite structurally cannot:
 * that the session survives React physically relocating the dragged card's DOM
 * node during a reorder. jsdom has no pointer capture at all — the unit suite
 * stubs `setPointerCapture` to a no-op — so a capture owner that gets detached
 * by reconciliation is invisible there and fatal here.
 */

const HARNESS = "/dev-drag-harness";

/** Widget cards in DOM order — what CSS grid auto-places from. */
async function order(page: Page): Promise<string[]> {
  return page
    .locator("[data-widget-id]")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.widgetId as string));
}

async function boxOf(page: Page, testid: string) {
  const box = await page.getByTestId(testid).boundingBox();
  if (!box) throw new Error(`no bounding box for ${testid}`);
  return box;
}

const centre = (b: { x: number; y: number; width: number; height: number }) => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

/**
 * Record the real pointer/capture lifecycle from inside the page. Listeners are
 * capture-phase and passive, so they observe without altering the interaction.
 */
async function instrument(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __dragLog: string[] };
    w.__dragLog = [];
    const log = (s: string) => w.__dragLog.push(s);
    const describe = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el || !el.tagName) return "none";
      const id = el.dataset?.testid ?? el.getAttribute?.("data-testid") ?? "";
      return `${el.tagName.toLowerCase()}${id ? `[${id}]` : ""}${
        el.isConnected ? "" : ":DETACHED"
      }`;
    };
    for (const type of [
      "pointerdown",
      "pointerup",
      "pointercancel",
      "gotpointercapture",
      "lostpointercapture",
    ]) {
      document.addEventListener(
        type,
        (e) => log(`${type}@${describe(e.target)} id=${(e as PointerEvent).pointerId}`),
        { capture: true, passive: true },
      );
    }
    // Preview-order changes, observed from the DOM rather than from React.
    const grid = document.querySelector("[data-widget-id]")?.parentElement;
    if (grid) {
      new MutationObserver(() => {
        const ids = Array.from(grid.querySelectorAll("[data-widget-id]"))
          .map((el) => (el as HTMLElement).dataset.widgetId)
          .join(",");
        const last = w.__dragLog.filter((l) => l.startsWith("order=")).pop();
        if (last !== `order=${ids}`) log(`order=${ids}`);
      }).observe(grid, { childList: true });
    }
  });
}

async function dragLog(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __dragLog: string[] }).__dragLog);
}

/** Who currently owns capture for this pointer, by test id. */
async function captureOwner(page: Page, pointerId = 1): Promise<string> {
  return page.evaluate((pid) => {
    const candidates = Array.from(
      document.querySelectorAll("[data-testid], [data-analytics-grid]"),
    ) as HTMLElement[];
    for (const el of candidates) {
      if (el.hasPointerCapture?.(pid)) {
        return el.dataset.testid ?? el.tagName.toLowerCase();
      }
    }
    return "none";
  }, pointerId);
}

async function openHarness(page: Page): Promise<void> {
  await page.goto(HARNESS);
  await expect(page.getByRole("button", { name: "Edit dashboard" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Edit dashboard" }).click();
  await expect(page.getByText("Edit mode is on.")).toBeVisible();
  await instrument(page);
}

/** Slot boxes BEFORE the drag — the frozen destinations the pointer aims at. */
async function slotBoxes(page: Page) {
  const ids = await order(page);
  const boxes = [];
  for (const id of ids) boxes.push(await boxOf(page, `analytics-widget-${id}`));
  return { ids, boxes };
}

/**
 * Press the grip. `hover()` first, deliberately: it waits for the element to be
 * STABLE (bounding box unchanged across frames). Reading a box and pressing at
 * those coordinates races the page still settling after the edit banner appears,
 * and the press then lands on whatever slid under it.
 */
async function grabGrip(page: Page, id: string) {
  const grip = page.getByTestId(`analytics-widget-drag-handle-${id}`);
  await grip.hover();
  await page.mouse.down();
}

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("drag session survives reordering in a real browser", () => {
  test("ONE SLOT RIGHT: session stays active, capture is never lost mid-drag", async ({
    page,
  }) => {
    await openHarness(page);
    const { ids, boxes } = await slotBoxes(page);
    const [alpha, bravo] = ids;
    const startOrder = [...ids];

    await grabGrip(page, alpha as string);

    // Capture must belong to the STABLE grid, never the grip inside the card
    // that reconciliation is about to move.
    expect(await captureOwner(page)).toBe("analytics-widget-grid");
    expect(await captureOwner(page)).not.toBe(`analytics-widget-drag-handle-${alpha}`);

    const bravoCentre = centre(boxes[1] as NonNullable<(typeof boxes)[0]>);
    await page.mouse.move(bravoCentre.x, bravoCentre.y, { steps: 15 });

    await expect
      .poll(async () => (await order(page)).slice(0, 2).join(","))
      .toBe(`${bravo},${alpha}`);

    const log = await dragLog(page);
    // The session must still be alive: nothing has released or cancelled it.
    expect(log.filter((l) => l.startsWith("pointerup"))).toHaveLength(0);
    expect(log.filter((l) => l.startsWith("pointercancel"))).toHaveLength(0);
    expect(log.filter((l) => l.startsWith("lostpointercapture"))).toHaveLength(0);
    await expect(page.getByTestId("analytics-drag-overlay")).toBeVisible();
    await expect(page.getByTestId(`analytics-drag-placeholder-${alpha}`)).toBeVisible();

    // Bravo slides into the vacated slot. Poll rather than sample: the FLIP
    // animation is still running, and a rect read mid-flight is the travelling
    // position, not the destination.
    await expect
      .poll(
        async () =>
          Math.abs(
            (await boxOf(page, `analytics-widget-${bravo}`)).x - (boxes[0] as { x: number }).x,
          ) <= 2,
        { timeout: 5_000 },
      )
      .toBe(true);

    await page.mouse.up();
    const committed = await order(page);
    expect(committed.slice(0, 2)).toEqual([bravo, alpha]);
    expect(committed).not.toEqual(startOrder);
    await expect(page.getByTestId("analytics-drag-overlay")).toHaveCount(0);
  });

  test("TWO SLOTS RIGHT: still one session, commit matches the visible preview", async ({
    page,
  }) => {
    await openHarness(page);
    const { ids, boxes } = await slotBoxes(page);
    const [alpha, bravo, charlie] = ids;

    await grabGrip(page, alpha as string);

    await page.mouse.move(
      centre(boxes[1] as { x: number; y: number; width: number; height: number }).x,
      centre(boxes[1] as { x: number; y: number; width: number; height: number }).y,
      { steps: 12 },
    );
    await expect.poll(async () => (await order(page)).slice(0, 2).join(",")).toBe(
      `${bravo},${alpha}`,
    );

    await page.mouse.move(
      centre(boxes[2] as { x: number; y: number; width: number; height: number }).x,
      centre(boxes[2] as { x: number; y: number; width: number; height: number }).y,
      { steps: 12 },
    );
    await expect.poll(async () => (await order(page)).slice(0, 3).join(",")).toBe(
      `${bravo},${charlie},${alpha}`,
    );

    const mid = await dragLog(page);
    expect(mid.filter((l) => l.startsWith("lostpointercapture"))).toHaveLength(0);
    expect(await captureOwner(page)).toBe("analytics-widget-grid");

    const previewed = await order(page);
    await page.mouse.up();
    expect(await order(page)).toEqual(previewed);

    // Capture released exactly once during cleanup, and that release did NOT
    // roll the commit back.
    const after = await dragLog(page);
    expect(after.filter((l) => l.startsWith("lostpointercapture")).length).toBeLessThanOrEqual(1);
    expect(await order(page)).toEqual(previewed);
  });

  test("ONE SLOT LEFT: same path, same guarantees", async ({ page }) => {
    await openHarness(page);
    const { ids, boxes } = await slotBoxes(page);
    const [alpha, bravo, charlie] = ids;

    await grabGrip(page, charlie as string);
    expect(await captureOwner(page)).toBe("analytics-widget-grid");

    await page.mouse.move(
      centre(boxes[1] as { x: number; y: number; width: number; height: number }).x,
      centre(boxes[1] as { x: number; y: number; width: number; height: number }).y,
      { steps: 15 },
    );
    await expect.poll(async () => (await order(page)).slice(0, 3).join(",")).toBe(
      `${alpha},${charlie},${bravo}`,
    );

    const log = await dragLog(page);
    expect(log.filter((l) => l.startsWith("lostpointercapture"))).toHaveLength(0);
    expect(log.filter((l) => l.startsWith("pointercancel"))).toHaveLength(0);

    // ...and on to the first slot.
    await page.mouse.move(
      centre(boxes[0] as { x: number; y: number; width: number; height: number }).x,
      centre(boxes[0] as { x: number; y: number; width: number; height: number }).y,
      { steps: 15 },
    );
    await expect.poll(async () => (await order(page))[0]).toBe(charlie);

    const previewed = await order(page);
    await page.mouse.up();
    expect(await order(page)).toEqual(previewed);
  });

  test("RIGHT, HOLD STILL, BACK, RIGHT AGAIN, then drop", async ({ page }) => {
    await openHarness(page);
    const { ids, boxes } = await slotBoxes(page);
    const [alpha, bravo] = ids;
    const startOrder = [...ids];
    const slot0 = centre(boxes[0] as { x: number; y: number; width: number; height: number });
    const slot1 = centre(boxes[1] as { x: number; y: number; width: number; height: number });

    await grabGrip(page, alpha as string);

    // Right.
    await page.mouse.move(slot1.x, slot1.y, { steps: 15 });
    await expect.poll(async () => (await order(page)).slice(0, 2).join(",")).toBe(
      `${bravo},${alpha}`,
    );

    // Hold still — nothing may move, and the session must stay alive.
    const settled = await order(page);
    const placeholderBefore = await boxOf(page, `analytics-drag-placeholder-${alpha}`);
    await page.waitForTimeout(1_000);
    expect(await order(page)).toEqual(settled);
    const placeholderAfter = await boxOf(page, `analytics-drag-placeholder-${alpha}`);
    expect(Math.abs(placeholderAfter.x - placeholderBefore.x)).toBeLessThanOrEqual(1);
    expect((await dragLog(page)).filter((l) => l.startsWith("lostpointercapture"))).toHaveLength(0);

    // Back to the original slot.
    await page.mouse.move(slot0.x, slot0.y, { steps: 15 });
    await expect.poll(async () => (await order(page)).join(",")).toBe(startOrder.join(","));

    // Right again, then drop.
    await page.mouse.move(slot1.x, slot1.y, { steps: 15 });
    await expect.poll(async () => (await order(page)).slice(0, 2).join(",")).toBe(
      `${bravo},${alpha}`,
    );
    const previewed = await order(page);
    await page.mouse.up();
    expect(await order(page)).toEqual(previewed);
  });

  test("post-drop hover changes nothing", async ({ page }) => {
    await openHarness(page);
    const { ids, boxes } = await slotBoxes(page);
    const [alpha] = ids;
    const slot1 = centre(boxes[1] as { x: number; y: number; width: number; height: number });
    const slot2 = centre(boxes[2] as { x: number; y: number; width: number; height: number });

    await grabGrip(page, alpha as string);
    await page.mouse.move(slot1.x, slot1.y, { steps: 12 });
    await page.mouse.up();
    const committed = await order(page);

    await page.mouse.move(slot2.x, slot2.y, { steps: 12 });
    await page.mouse.move(slot1.x, slot1.y, { steps: 12 });
    expect(await order(page)).toEqual(committed);
    await expect(page.getByTestId("analytics-drag-overlay")).toHaveCount(0);
    expect(await page.locator("[data-testid^='analytics-drag-placeholder']").count()).toBe(0);
  });

  test("Escape cancels and restores the committed order", async ({ page }) => {
    await openHarness(page);
    const { ids, boxes } = await slotBoxes(page);
    const [alpha, bravo] = ids;
    const startOrder = [...ids];

    await grabGrip(page, alpha as string);
    await page.mouse.move(
      centre(boxes[2] as { x: number; y: number; width: number; height: number }).x,
      centre(boxes[2] as { x: number; y: number; width: number; height: number }).y,
      { steps: 12 },
    );
    await expect.poll(async () => (await order(page))[0]).toBe(bravo);

    await page.keyboard.press("Escape");
    await expect.poll(async () => (await order(page)).join(",")).toBe(startOrder.join(","));
    await expect(page.getByTestId("analytics-drag-overlay")).toHaveCount(0);
    await page.mouse.up();
    // The release after a cancel must not resurrect a commit.
    expect(await order(page)).toEqual(startOrder);
  });

  test("capture owns the gesture: releasing outside the grid still commits once", async ({
    page,
  }) => {
    // With the grid holding capture, pointer events go to the grid wherever the
    // cursor is — so a release over other page chrome is a normal drop, not a
    // lost or duplicated gesture. (Edit-mode-exit CANCELLATION is covered in the
    // jsdom suite, where `editing` can be flipped directly; through the UI it is
    // unreachable mid-drag precisely because capture holds the pointer.)
    await openHarness(page);
    const { ids, boxes } = await slotBoxes(page);
    const [alpha, bravo] = ids;

    await grabGrip(page, alpha as string);
    await page.mouse.move(
      centre(boxes[2] as { x: number; y: number; width: number; height: number }).x,
      centre(boxes[2] as { x: number; y: number; width: number; height: number }).y,
      { steps: 12 },
    );
    await expect.poll(async () => (await order(page))[0]).toBe(bravo);
    const previewed = await order(page);

    // Release far outside the grid entirely.
    await page.mouse.move(5, 5, { steps: 8 });
    await page.mouse.up();

    expect(await order(page)).toEqual(previewed);
    await expect(page.getByTestId("analytics-drag-overlay")).toHaveCount(0);
    expect(await page.locator("[data-testid^='analytics-drag-placeholder']").count()).toBe(0);

    // A second release must not commit again or resurrect anything.
    await page.mouse.up();
    expect(await order(page)).toEqual(previewed);
  });

  test("card controls never start a drag", async ({ page }) => {
    await openHarness(page);
    const before = await order(page);
    const first = before[0] as string;
    const card = page.getByTestId(`analytics-widget-${first}`);

    // Resize.
    await card.getByLabel("Resize widget").selectOption("m");
    await expect(page.getByTestId("analytics-drag-overlay")).toHaveCount(0);
    // Rename (click the title).
    await card.getByRole("button", { name: /Alpha|Bravo|Charlie|Delta/ }).first().click();
    await expect(page.getByTestId("analytics-drag-overlay")).toHaveCount(0);
    await page.keyboard.press("Escape");
    // Configure + duplicate buttons.
    await card.getByLabel("Configure widget").click();
    await expect(page.getByTestId("analytics-drag-overlay")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // A press-drag from the card body must not move anything either.
    const body = await boxOf(page, `analytics-widget-${first}`);
    await page.mouse.move(body.x + body.width / 2, body.y + body.height - 15);
    await page.mouse.down();
    await page.mouse.move(body.x + body.width * 2, body.y + body.height - 15, { steps: 10 });
    await expect(page.getByTestId("analytics-drag-overlay")).toHaveCount(0);
    await page.mouse.up();
    expect((await order(page)).join(",")).toBe(before.join(","));
  });
});
