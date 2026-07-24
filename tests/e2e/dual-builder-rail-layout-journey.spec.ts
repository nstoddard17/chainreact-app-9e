import { test, expect, type Page } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  signInViaEmailLink,
  type TestUser,
} from "./helpers/supabaseAdmin";

/**
 * DOC-RAIL-LAYOUT-1 — the real-browser Document Builder layout journey.
 *
 * Proves the Document-mode Agent-rail contract end-to-end in a live browser:
 * Visual opens with the rail in its normal (expanded) state; switching to
 * Document collapses the persistent rail so the Document owns the full
 * workspace (centered readable column, no duplicate AI surface); the
 * Document's Ask React bar expands the ONE existing rail and seeds the ONE
 * composer (no second panel/conversation, no auto-send, no mutation); closing
 * the rail returns the full-width Document with composer text intact;
 * switching back to Visual restores the Visual rail state; the Whole Workflow
 * map still opens as a usable right-side sheet; and laptop + 400px viewports
 * stay overflow-free with the Ask React composer reachable.
 *
 * Requires ENABLE_DOCUMENT_BUILDER=true (command env; the checked-in default
 * stays OFF). Screenshots land in owner-review/doc-rail-layout/ as the
 * "after" evidence set.
 */

const FLAG_ON = process.env.ENABLE_DOCUMENT_BUILDER === "true";

let testUser: TestUser | null = null;

const definition = {
  nodes: [
    { id: "t", kind: "trigger", provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action", provider: "slack", type: "send_channel_message", config: { text: "New lead!" }, position: { x: 0, y: 140 } },
    { id: "b", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 280 } },
  ],
  edges: [
    { id: "e-ta", from: "t", to: "a" },
    { id: "e-ab", from: "a", to: "b" },
  ],
};

test.describe("DOC-RAIL-LAYOUT-1 — Document rail/layout journey @flag-on", () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async () => {
    expect(FLAG_ON, "DOC-RAIL-LAYOUT-1 requires ENABLE_DOCUMENT_BUILDER=true").toBe(true);
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("Document collapses the rail; Ask React opens the one rail; close returns full width; Visual state restored; map + narrow widths stay usable", async ({
    page,
  }) => {
    if (!testUser) throw new Error("setup failed");
    await page.setViewportSize({ width: 1366, height: 768 });
    await signInViaEmailLink(page, testUser);
    const workflowId = await createWorkflow(page, "Rail layout journey");
    await seedDefinition(page, workflowId);
    await page.reload();
    // The dev-server reload can occasionally race the auth cookie refresh and
    // land on the sign-in page — recover by re-driving the real sign-in flow
    // straight back to this workflow (never continue unauthenticated).
    if (
      await page
        .getByRole("heading", { name: /sign in to your account/i })
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      await signInViaEmailLink(page, testUser, { next: `/workflows/${workflowId}` });
    }

    const rail = page.getByTestId("builder-left-agent-rail");

    // ── 1. Visual: the rail is in its normal (expanded) state ────────────────
    await expect(page.getByTestId("workflow-node-view").first()).toBeVisible();
    await expect(rail).toHaveAttribute("data-collapsed", "false");

    // ── 2-4. Switch to Document → rail collapses; workspace expands centered ─
    await page.getByTestId("builder-view-toggle-document").click();
    await expect(page.getByTestId("document-view")).toBeVisible();
    await expect(rail).toHaveAttribute("data-collapsed", "true");
    // Collapsed rail is the 40px spine — the Document owns the workspace.
    const railBox = (await rail.boundingBox())!;
    expect(railBox.width).toBeLessThanOrEqual(48);
    // The readable column is centered inside the document surface.
    const view = (await page.getByTestId("document-view").boundingBox())!;
    const masthead = (await page.getByTestId("document-masthead").boundingBox())!;
    const viewCenter = view.x + view.width / 2;
    const mastheadCenter = masthead.x + masthead.width / 2;
    expect(Math.abs(viewCenter - mastheadCenter)).toBeLessThanOrEqual(24);
    // No duplicate AI surface: the Document's own bar is the one visible entry.
    // (The guidance panel from the Visual session stays MOUNTED but hidden —
    // the keep-alive that preserves composer/conversation state — so the
    // assertion is visibility, not absence.)
    await expect(page.getByTestId("document-ask-react-bar")).toBeVisible();
    await expect(page.getByTestId("workflow-guidance-panel")).toBeHidden();
    await shot(page, "after-01-document-default-laptop");

    // ── 5-6. Ask React opens the ONE existing rail and seeds the ONE composer ─
    await page.getByTestId("document-ask-react-input").fill("Add a follow-up email step");
    await page.getByTestId("document-ask-react-submit").click();
    await expect(rail).toHaveAttribute("data-collapsed", "false");
    await expect(page.getByTestId("builder-guidance-rail")).toHaveCount(1);
    await expect(page.getByTestId("workflow-guidance-panel")).toHaveCount(1);
    const composer = page.getByRole("textbox", { name: /Message React/i });
    await expect(composer).toHaveCount(1);
    await expect(composer).toHaveValue(/follow-up email/i);
    // Seeding never sends and never dirties/saves the workflow.
    await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();
    await shot(page, "after-02-document-rail-open-laptop");

    // ── 7-8. Close the rail → full-width Document; composer state survives ──
    await composer.fill("Add a follow-up email step plus a reminder");
    await page.getByTestId("builder-left-agent-rail-collapse").click();
    await expect(rail).toHaveAttribute("data-collapsed", "true");
    await expect(page.getByTestId("document-view")).toBeVisible();
    await page.getByTestId("builder-left-agent-rail-expand").click();
    await expect(composer).toHaveValue("Add a follow-up email step plus a reminder");
    await page.getByTestId("builder-left-agent-rail-collapse").click();
    await expect(rail).toHaveAttribute("data-collapsed", "true");
    await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();

    // ── 9-10. Back to Visual → usable, rail restored to its Visual state ─────
    await page.getByTestId("builder-view-toggle-visual").click();
    await expect(page.getByTestId("workflow-node-view").first()).toBeVisible();
    await expect(rail).toHaveAttribute("data-collapsed", "false");

    // ── 11. Whole Workflow map stays a usable right-side sheet ───────────────
    await page.getByTestId("builder-view-toggle-document").click();
    await expect(rail).toHaveAttribute("data-collapsed", "true");
    await page.getByTestId("document-open-map-button").click();
    await expect(page.getByTestId("document-whole-workflow-map")).toBeVisible();
    await expect(page.getByTestId("document-view")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shot(page, "after-03-document-map-open-laptop");
    await page.getByTestId("document-map-close").click();

    // ── 12. Responsive: wide, narrow desktop, and 400px stay usable ──────────
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.getByTestId("document-ask-react-input")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shot(page, "after-04-document-wide");

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByTestId("document-ask-react-input")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shot(page, "after-05-document-narrow-desktop");

    await page.setViewportSize({ width: 400, height: 800 });
    await expect(page.getByTestId("document-view")).toBeVisible();
    await expect(page.getByTestId("document-ask-react-input")).toBeVisible();
    // Header lifecycle controls are not clipped.
    await expect(page.getByTestId("builder-header-save-button")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // The map becomes an overlay sheet at this width — document not crushed.
    await page.getByTestId("document-open-map-button").click();
    await expect(page.getByTestId("document-whole-workflow-map")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByTestId("document-map-close").click();
    await shot(page, "after-06-document-400px");

    // Nothing was mutated or saved by any of the above.
    await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();
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

async function shot(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `owner-review/doc-rail-layout/${name}.png`, fullPage: false });
  } catch {
    /* evidence only */
  }
}

async function seedDefinition(page: Page, workflowId: string): Promise<void> {
  // Warm the on-demand-compiled dev route, then PATCH with a short retry —
  // the first hit can race Next's dev compilation (PageNotFoundError 500).
  await page.request.get(`/api/workflows/${workflowId}`).catch(() => undefined);
  for (let attempt = 0; attempt < 5; attempt++) {
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
  await page.getByTestId("workflows-toolbar").getByRole("button", { name: "Create workflow" }).click();
  await page.getByLabel(/workflow name/i).fill(name);
  await Promise.all([
    page.waitForURL(/\/workflows\/[0-9a-f-]+/),
    page.getByRole("button", { name: "Create", exact: true }).click(),
  ]);
  return page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;
}
