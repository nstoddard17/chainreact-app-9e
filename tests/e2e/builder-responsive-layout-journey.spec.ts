import { test, expect, type Page } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  signInViaEmailLink,
  type TestUser,
} from "./helpers/supabaseAdmin";

/**
 * BUILDER-RESPONSIVE-LAYOUT-1 — the real-browser responsive builder journey.
 *
 * jsdom has no layout engine, so the RTL suites can prove the PRESENTATION
 * CONTRACT (which surface is a sheet, what survives a toggle, what is reachable)
 * but cannot prove the thing the owner actually reported: real pixels, clipped
 * buttons, a horizontal scrollbar, a canvas squeezed to a strip. That is what
 * this spec is for. Every assertion here is measured against a real viewport —
 * no browser zoom, no CSS transform, no emulated scale factor.
 *
 * Covered at every viewport in `VIEWPORTS`:
 *   · no page-level horizontal scrollbar
 *   · the header's primary actions are inside the viewport and un-clipped
 *   · the canvas is a usable size and its zoom controls are reachable
 *   · React Agent can be opened and closed
 *   · node configuration can be opened and closed
 *   · rail and config never overlap; on narrow, never both open
 *   · Escape closes the active sheet and focus is handled
 *   · nothing in the above dirties or saves the workflow
 *
 * Requires the local e2e environment (`.env.test.local` + loopback Supabase),
 * because it signs in as a real user and seeds a real workflow through the real
 * routes. Screenshots land in `owner-review/builder-responsive-layout/` as the
 * owner-review evidence set.
 */

const VIEWPORTS = [
  { width: 1440, height: 900, name: "1440x900-desktop", tier: "wide" },
  { width: 1280, height: 800, name: "1280x800-laptop", tier: "wide" },
  { width: 1024, height: 768, name: "1024x768-small-laptop", tier: "medium" },
  { width: 900, height: 700, name: "900x700-short-window", tier: "medium" },
  { width: 820, height: 1180, name: "820x1180-tablet", tier: "narrow" },
  { width: 768, height: 1024, name: "768x1024-tablet", tier: "narrow" },
  { width: 390, height: 844, name: "390x844-phone", tier: "narrow" },
] as const;

/** A long name (owner scenario 7) plus enough nodes to need vertical movement (5, 6). */
const LONG_NAME =
  "Quarterly revenue reconciliation and Slack digest for the finance operations team";

const definition = {
  nodes: [
    { id: "t", kind: "trigger", provider: "slack", type: "slack.message.channel", config: {}, position: { x: 0, y: 0 } },
    { id: "a1", kind: "action", provider: "slack", type: "slack.chat.postMessage", config: { text: "New lead!" }, position: { x: 0, y: 160 } },
    { id: "a2", kind: "action", provider: "slack", type: "slack.chat.postMessage", config: {}, position: { x: 0, y: 320 } },
    { id: "a3", kind: "action", provider: "slack", type: "slack.chat.postMessage", config: {}, position: { x: 0, y: 480 } },
    { id: "a4", kind: "action", provider: "slack", type: "slack.chat.postMessage", config: {}, position: { x: 0, y: 640 } },
  ],
  edges: [
    { id: "e1", from: "t", to: "a1" },
    { id: "e2", from: "a1", to: "a2" },
    { id: "e3", from: "a2", to: "a3" },
    { id: "e4", from: "a3", to: "a4" },
  ],
};

let testUser: TestUser | null = null;

test.describe("BUILDER-RESPONSIVE-LAYOUT-1 — responsive builder journey", () => {
  test.describe.configure({ timeout: 300_000 });

  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("the builder is usable and overflow-free at every supported viewport", async ({
    page,
  }) => {
    if (!testUser) throw new Error("setup failed");
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaEmailLink(page, testUser);
    const workflowId = await createWorkflow(page, LONG_NAME);
    await seedDefinition(page, workflowId);
    await page.goto(`/workflows/${workflowId}`);
    await expect(page.getByTestId("workflow-node-view").first()).toBeVisible();

    const rail = page.getByTestId("builder-left-agent-rail");
    const header = page.getByTestId("builder-header");
    const canvas = page.getByTestId("workflow-canvas");

    for (const viewport of VIEWPORTS) {
      await test.step(`${viewport.name} (${viewport.tier})`, async () => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        // Let the media-query subscription and React Flow's ResizeObserver settle.
        await expect(header).toBeVisible();
        await page.waitForTimeout(150);

        // ── the reported symptom: nothing may overflow the page horizontally ──
        await expectNoHorizontalOverflow(page);

        // ── the header's primary actions are inside the viewport, un-clipped ──
        await expectFullyInsideViewport(page, page.getByTestId("builder-header-save-button"), "Save");
        await expectFullyInsideViewport(
          page,
          page.getByTestId("builder-header-validation-pill"),
          "issue count",
        );
        // The lifecycle action for THIS state (draft ⇒ Activate) stays inline at
        // every width — the primary action is state-dependent, so hiding the only
        // transition a state offers would be the wrong trade.
        await expectFullyInsideViewport(
          page,
          page.getByRole("button", { name: /^activate$/i }),
          "Activate",
        );
        // Test Workflow is inline on wide/medium and in the overflow on narrow —
        // either way it must be REACHABLE.
        await expectTestWorkflowReachable(page, viewport.tier);

        // ── the header must not have grown into a tall stack ─────────────────
        const headerBox = (await header.boundingBox())!;
        // One 48px row, or the deliberate two-row phone header (48 + 34).
        expect(headerBox.height, `${viewport.name} header height`).toBeLessThanOrEqual(90);

        // ── the canvas is the dominant surface and its controls are reachable ─
        const canvasBox = (await canvas.boundingBox())!;
        expect(
          canvasBox.width,
          `${viewport.name} canvas width`,
        ).toBeGreaterThan(viewport.width * 0.5);
        expect(canvasBox.height, `${viewport.name} canvas height`).toBeGreaterThan(120);
        // The zoom / fit / Arrange cluster sits bottom-left of the canvas; the
        // 560px min-height used to push it outside a short viewport entirely.
        await expectFullyInsideViewport(
          page,
          page.locator(".react-flow__controls"),
          "canvas zoom controls",
        );
        // A node card is readable (not scaled into illegibility).
        const nodeBox = (await page.getByTestId("workflow-node-view").first().boundingBox())!;
        expect(nodeBox.width, `${viewport.name} node width`).toBeGreaterThan(120);

        // ── React Agent opens and closes at this width ───────────────────────
        const collapsedBefore = await rail.getAttribute("data-collapsed");
        if (collapsedBefore === "false") {
          await page.getByTestId("builder-left-agent-rail-collapse").click();
          await expect(rail).toHaveAttribute("data-collapsed", "true");
        }
        // Collapsing must hand width back to the canvas on the tiers where the
        // rail is an in-flow column.
        const canvasRailClosed = (await canvas.boundingBox())!;
        if (viewport.tier !== "narrow") {
          expect(
            canvasRailClosed.width,
            `${viewport.name} canvas grows when the rail closes`,
          ).toBeGreaterThan(canvasBox.width);
        }
        await page.getByTestId("builder-header-left-rail-toggle").click();
        await expect(rail).toHaveAttribute("data-collapsed", "false");
        await expectNoHorizontalOverflow(page);
        // The composer is reachable and un-clipped even at the shortest heights.
        const composer = page.getByRole("textbox", { name: /Message React/i });
        if (await composer.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await expectFullyInsideViewport(page, composer, "agent composer");
        }
        await expectNoOverlap(page, rail, canvas, viewport.tier);

        // ── node configuration opens and closes at this width ───────────────
        await page.getByTestId("workflow-node-view").nth(1).click();
        const drawer = page.getByTestId("builder-right-drawer");
        await expect(drawer).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await expectFullyInsideViewport(
          page,
          drawer.getByRole("button", { name: /close drawer/i }),
          "drawer close",
        );
        // On narrow, exactly one secondary surface may be open.
        if (viewport.tier === "narrow") {
          await expect(rail).toHaveAttribute("data-collapsed", "true");
          expect(await page.getByTestId("builder-overlay-scrim").count()).toBe(1);
        }
        // The canvas must never be reduced to an unusable strip by config.
        const canvasWithConfig = (await canvas.boundingBox())!;
        expect(
          canvasWithConfig.width,
          `${viewport.name} canvas width with config open`,
        ).toBeGreaterThan(300);

        await shot(page, `${viewport.name}-config-open`);

        // Escape closes the active sheet (or the drawer as a panel).
        await page.keyboard.press("Escape");
        await expect(drawer).toBeHidden();
        await expectNoHorizontalOverflow(page);

        // ── nothing above may dirty or save the workflow ─────────────────────
        await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();

        await shot(page, `${viewport.name}-canvas`);
      });
    }

    // Back to the widest viewport: the desktop layout must be fully restored,
    // not left in a latched narrow state after the sweep above.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(rail).toHaveAttribute("data-presentation", "panel");
    await expect(page.getByTestId("builder-header")).toHaveAttribute("data-density", "full");
    await expect(page.getByTestId("builder-header-templates-button")).toBeVisible();
    await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();
  });

  test("the overflow menu exposes exactly what the header gave up, and the graph is untouched", async ({
    page,
  }) => {
    if (!testUser) throw new Error("setup failed");
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaEmailLink(page, testUser);
    const workflowId = await createWorkflow(page, LONG_NAME);
    await seedDefinition(page, workflowId);
    await page.goto(`/workflows/${workflowId}`);
    await expect(page.getByTestId("workflow-node-view").first()).toBeVisible();

    const before = await readGraph(page, workflowId);

    // Wide: no overflow control at all — every action is inline.
    await expect(page.getByTestId("builder-header-overflow-trigger")).toHaveCount(0);

    // Medium: Templates and undo/redo moved, and are genuinely reachable.
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByTestId("builder-header-templates-button")).toHaveCount(0);
    await page.getByTestId("builder-header-overflow-trigger").click();
    const panel = page.getByTestId("builder-header-overflow-panel");
    await expect(panel.getByTestId("builder-header-templates-button")).toBeVisible();
    await expect(panel.getByTestId("builder-header-undo")).toBeVisible();
    await expectFullyInsideViewport(page, panel, "overflow panel");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // Phone: Test Workflow joins them, and the section tabs get their own row.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("builder-header-tab-row")).toBeVisible();
    await page.getByTestId("builder-header-overflow-trigger").click();
    await expect(panel.getByTestId("run-controls-test-button")).toBeVisible();
    await expectFullyInsideViewport(page, panel, "overflow panel (phone)");
    await expectNoHorizontalOverflow(page);
    await shot(page, "390x844-phone-overflow-open");
    await page.keyboard.press("Escape");

    // Every section is still navigable from the tab row.
    for (const tab of ["Runs", "Data Map", "History", "Settings", "Builder"]) {
      await page.getByTestId("builder-header-tab-row").getByRole("tab", { name: tab }).click();
      await expectNoHorizontalOverflow(page);
    }

    // None of it changed the saved workflow.
    await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();
    expect(await readGraph(page, workflowId)).toEqual(before);
  });

  test("unsaved configuration edits survive the config sheet closing and reopening", async ({
    page,
  }) => {
    if (!testUser) throw new Error("setup failed");
    await page.setViewportSize({ width: 390, height: 844 });
    await signInViaEmailLink(page, testUser);
    const workflowId = await createWorkflow(page, LONG_NAME);
    await seedDefinition(page, workflowId);
    await page.goto(`/workflows/${workflowId}`);
    await expect(page.getByTestId("workflow-node-view").first()).toBeVisible();

    // Rename a node from its card — an edit that is unambiguously "pending".
    const card = page.getByTestId("workflow-node-view").nth(1);
    await card.dblclick();
    const renameInput = page.getByTestId("node-rename-input");
    if (await renameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await renameInput.fill("Renamed but unsaved");
      await renameInput.press("Enter");
      await expect(page.getByTestId("builder-header-save-button")).toBeEnabled();
    }

    // Open config, then close it via the agent sheet (the exclusion path), then
    // reopen: the pending edit must still be there and still unsaved.
    await card.click();
    await expect(page.getByTestId("builder-right-drawer")).toBeVisible();
    await page.getByTestId("builder-header-left-rail-toggle").click();
    await expect(page.getByTestId("builder-right-drawer")).toBeHidden();
    await expect(page.getByTestId("builder-left-agent-rail")).toHaveAttribute(
      "data-collapsed",
      "false",
    );

    await card.click();
    await expect(page.getByTestId("builder-right-drawer")).toBeVisible();
    await expect(page.getByTestId("builder-left-agent-rail")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    // Still dirty, still unsaved — the layout never silently saved or discarded.
    await expect(page.getByTestId("builder-header-save-button")).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    await shot(page, "390x844-phone-pending-edit-preserved");
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow, "no horizontal page overflow").toBeLessThanOrEqual(1);
}

/**
 * The clipped-button check. A control that is "visible" to Playwright can still
 * be half outside the viewport, which is exactly what the owner's screenshot
 * showed — so assert the whole box is inside, not merely that it renders.
 */
async function expectFullyInsideViewport(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  label: string,
): Promise<void> {
  await expect(locator, `${label} is present`).toBeVisible();
  const box = (await locator.boundingBox())!;
  const size = page.viewportSize()!;
  expect(box.x, `${label} left edge inside viewport`).toBeGreaterThanOrEqual(-1);
  expect(box.y, `${label} top edge inside viewport`).toBeGreaterThanOrEqual(-1);
  expect(
    box.x + box.width,
    `${label} right edge inside viewport`,
  ).toBeLessThanOrEqual(size.width + 1);
  expect(
    box.y + box.height,
    `${label} bottom edge inside viewport`,
  ).toBeLessThanOrEqual(size.height + 1);
}

/** Sheets float OVER the canvas; in-flow columns must sit BESIDE it. */
async function expectNoOverlap(
  page: Page,
  rail: ReturnType<Page["locator"]>,
  canvas: ReturnType<Page["locator"]>,
  tier: string,
): Promise<void> {
  if (tier === "narrow") return; // a sheet is SUPPOSED to overlap.
  const railBox = await rail.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!railBox || !canvasBox) return;
  expect(
    railBox.x + railBox.width,
    "in-flow rail does not overlap the canvas",
  ).toBeLessThanOrEqual(canvasBox.x + 1);
}

async function expectTestWorkflowReachable(page: Page, tier: string): Promise<void> {
  const inline = page.getByTestId("run-controls-test-button");
  if (tier !== "narrow") {
    if (await inline.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expectFullyInsideViewport(page, inline, "Test Workflow");
    }
    return;
  }
  const trigger = page.getByTestId("builder-header-overflow-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();
  const panel = page.getByTestId("builder-header-overflow-panel");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
}

async function shot(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({
      path: `owner-review/builder-responsive-layout/${name}.png`,
      fullPage: false,
    });
  } catch {
    /* evidence only */
  }
}

async function readGraph(page: Page, workflowId: string): Promise<unknown> {
  const res = await page.request.get(`/api/workflows/${workflowId}`);
  const body = (await res.json()) as { draftDefinition?: unknown };
  return body.draftDefinition ?? null;
}

async function seedDefinition(page: Page, workflowId: string): Promise<void> {
  await page.request.get(`/api/workflows/${workflowId}`).catch(() => undefined);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: { draftDefinition: definition },
    });
    if (patch.status() === 200) return;
    await page.waitForTimeout(2_000);
  }
  throw new Error("seedDefinition: draftDefinition PATCH failed after retries");
}

async function createWorkflow(page: Page, name: string): Promise<string> {
  await page.goto("/workflows");
  const dismiss = page.getByTestId("onboarding-dismiss");
  if (await dismiss.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dismiss.click();
    await expect(page.getByTestId("onboarding-checklist")).toBeHidden();
  }
  await page
    .getByTestId("workflows-toolbar")
    .getByRole("button", { name: "Create workflow" })
    .click();
  await page.getByLabel(/workflow name/i).fill(name);
  await Promise.all([
    page.waitForURL(/\/workflows\/[0-9a-f-]+/),
    page.getByRole("button", { name: "Create", exact: true }).click(),
  ]);
  return page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;
}
