import { test, expect, type Page } from "@playwright/test";
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  signInViaEmailLink,
  type TestUser,
} from "./helpers/supabaseAdmin";

/**
 * 5.DUAL-BUILDER-1 CS-7F — the real-browser Ask React (Agent) preview/apply journey.
 *
 * The ONLY thing mocked is the external model RESPONSE, via the loopback mock
 * Hermes gateway started by global-setup (tests/e2e/helpers/mockHermesServer.ts).
 * Everything else is real: the Document Ask React control, the ONE Agent rail +
 * composer, WorkflowGuidancePanel, the account guidance route, response parsing
 * (normalizeGatewayResponse + validateWorkflowPlan), the auto-shown Document ghost
 * preview, useBuilderPreview, checkpoint/change-history, graphSlice apply, Save.
 *
 * Requires ENABLE_DOCUMENT_BUILDER=true + the mock gateway (both set by
 * playwright.config webServer.env / global-setup). Runs @flag-on, one worker.
 * AI proposes · the user reviews · Apply is explicit · Save is explicit.
 */

const FLAG_ON = process.env.ENABLE_DOCUMENT_BUILDER === "true";

let testUser: TestUser | null = null;

test.describe("5.DUAL-BUILDER-1 CS-7F — Ask React preview/apply (live) @flag-on", () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async () => {
    expect(FLAG_ON, "CS-7F requires ENABLE_DOCUMENT_BUILDER=true").toBe(true);
    testUser = await createTestUser();
    const admin = adminClient();
    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("owner_user_id", testUser.id)
      .single<{ id: string }>();
    if (!account) throw new Error("CS-7F: personal account not found");
    const { error } = await admin
      .from("account_billing")
      .update({ plan: "pro", plan_status: "active" })
      .eq("account_id", account.id);
    if (error) throw new Error(`CS-7F: pro-plan stamp failed: ${error.message}`);
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("additive proposal: one rail/composer, seed, non-mutating preview, reject, apply, parity, undo/redo, save/reload", async ({
    page,
  }) => {
    if (!testUser) throw new Error("setup failed");
    await signInViaEmailLink(page, testUser);
    const workflowId = await createWorkflow(page, "CS-7F additive");

    // Empty base workflow — a fresh canvas React can build a skeleton onto.
    const before = await readDefinition(page, workflowId);
    expect(before.nodes).toHaveLength(0);

    await toDocument(page);
    await expect(page.getByTestId("document-empty-state")).toBeVisible();

    // ── Seed the ONE composer via the Document empty-state Ask React entry ────
    await page.getByTestId("document-draft-composer").fill("Build a workflow that sends a Slack notification when I run it manually");
    await page.getByTestId("document-draft-submit").click();
    // Exactly one Agent rail + one composer (the Document opens no second panel).
    await expect(page.getByTestId("builder-guidance-rail")).toHaveCount(1);
    await expect(page.getByTestId("workflow-guidance-panel")).toHaveCount(1);
    const composer = page.getByRole("textbox", { name: /Message React/i });
    await expect(composer).toHaveValue(/Slack notification/i);
    await shot(page, "cs7f-01-composer-seeded");

    // ── Submit → real route → mock Hermes → real parse → auto-shown ghost ────
    await page.getByTestId("workflow-guidance-submit").click();
    const preview = page.getByTestId("document-preview");
    await expect(preview).toBeVisible({ timeout: 25_000 });
    await expect(preview).toContainText(/preview/i);
    await shot(page, "cs7f-02-ghost-preview");

    // Non-mutating before Apply: live graph/count/dirty/Save unchanged.
    await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();
    const duringPreview = await readDefinition(page, workflowId);
    expect(duringPreview.nodes).toHaveLength(before.nodes.length);
    expect(duringPreview.edges).toHaveLength(before.edges.length);

    // ── Reject → no mutation ─────────────────────────────────────────────────
    await page.getByTestId("document-preview-reject").click();
    await expect(page.getByTestId("document-preview")).toHaveCount(0);
    await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();
    const afterReject = await readDefinition(page, workflowId);
    expect(afterReject.nodes).toHaveLength(before.nodes.length);
    // The one Agent rail + its conversation remain.
    await expect(page.getByTestId("workflow-guidance-panel")).toHaveCount(1);

    // ── Submit again → Apply ─────────────────────────────────────────────────
    const APPLIED = 2; // the proposed skeleton: Manual Trigger + Slack action
    await composer.fill("Build a workflow that sends a Slack notification when I run it manually");
    await page.getByTestId("workflow-guidance-submit").click();
    await expect(page.getByTestId("document-preview")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("document-preview-apply").click();
    await expect(page.getByTestId("document-preview")).toHaveCount(0);
    // Dirty but NOT saved; no duplicate workflow.
    await expect(page.getByTestId("builder-header-save-button")).toBeEnabled();
    await shot(page, "cs7f-03-applied-unsaved");

    // Checkpoint + Agent change-history are recorded through the EXISTING governed
    // paths (observable API / DB) — not just a mocked call.
    const changesResp = await page.request.get(`/api/workflows/${workflowId}/agent-changes`);
    expect(changesResp.status()).toBe(200);
    const changeItems = (await changesResp.json()).items as unknown[];
    expect(changeItems.length, "an Agent change-history item exists after Apply").toBeGreaterThan(0);
    const checkpointCount = await countCheckpoints(workflowId);
    expect(checkpointCount, "a pre-apply checkpoint row exists").toBeGreaterThan(0);

    // Visual parity: the applied skeleton is real pending nodes.
    await toVisual(page);
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(APPLIED);

    // Undo from Visual → removed; redo → returns.
    await page.getByTestId("builder-header-undo").click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(before.nodes.length);
    await page.getByTestId("builder-header-redo").click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(APPLIED);

    // Explicit Save → the same workflow record is updated; reload → persists.
    await saveWorkflow(page);
    const afterSave = await readDefinition(page, workflowId);
    expect(afterSave.nodes.length).toBe(APPLIED);
    await page.reload();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(APPLIED);
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────
/** Count pre-apply checkpoint rows for a workflow (observable DB path, admin client). */
async function countCheckpoints(workflowId: string): Promise<number> {
  const { count, error } = await adminClient()
    .from("workflow_checkpoints")
    .select("id", { count: "exact", head: true })
    .eq("workflow_id", workflowId);
  if (error) throw new Error(`countCheckpoints: ${error.message}`);
  return count ?? 0;
}
async function shot(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `owner-review/cs7f/${name}.png`, fullPage: true });
  } catch {
    /* evidence only */
  }
}
async function toDocument(page: Page): Promise<void> {
  await page.getByTestId("builder-view-toggle-document").click();
  await expect(page.getByTestId("document-view")).toBeVisible();
}
async function toVisual(page: Page): Promise<void> {
  await page.getByTestId("builder-view-toggle-visual").click();
  await expect(page.getByTestId("workflow-node-view").first()).toBeVisible();
}
async function saveWorkflow(page: Page): Promise<void> {
  const save = page.getByTestId("builder-header-save-button");
  await expect(save).toBeEnabled({ timeout: 10_000 });
  await save.click();
  await expect(save).toHaveText("Save", { timeout: 15_000 });
  await expect(save).toBeDisabled();
}
interface Definition {
  nodes: Array<{ id: string; type: string; config?: Record<string, unknown> }>;
  edges: Array<{ id: string; from: string; to: string; label?: string }>;
}
async function readDefinition(page: Page, workflowId: string): Promise<Definition> {
  const resp = await page.request.get(`/api/workflows/${workflowId}`);
  expect(resp.status(), await resp.text()).toBe(200);
  return (await resp.json()).draftDefinition as Definition;
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
