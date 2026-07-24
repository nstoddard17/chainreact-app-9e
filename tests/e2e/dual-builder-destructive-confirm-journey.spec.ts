import { test, expect, type Page } from "@playwright/test";
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  waitFor,
  signInViaEmailLink,
  type TestUser,
} from "./helpers/supabaseAdmin";
import { seedEditableWorkflow } from "./helpers/dualBuilderFixtures";

/**
 * DOC-FINAL-ACCEPTANCE-1 — center Document destructive-apply confirmation (live).
 *
 * Drives the CENTER Document ghost-preview Apply through the REAL mutation pipeline
 * (only the model RESPONSE is mocked, via loopback mock Hermes). Proves the seam the
 * final acceptance closes: a destructive proposal cannot apply on a single click from
 * the center — the Apply names the removal and opens the SHARED confirmation; Cancel
 * mutates nothing (and returns to the preview); Confirm applies through the SAME
 * governed useBuilderPreview path with a checkpoint + Agent history; undo restores /
 * redo removes; a stale destructive proposal still refuses after a real edit; a Free
 * account cannot bypass entitlement; and the confirmation stays usable with the Agent
 * rail collapsed (default) and explicitly open, and at 400px.
 *
 * Requires ENABLE_DOCUMENT_BUILDER=true + the loopback mock (playwright.config /
 * global-setup). One worker (stateful). Screenshots → owner-review/doc-final/ (gitignored).
 */

const FLAG_ON = process.env.ENABLE_DOCUMENT_BUILDER === "true";

let testUser: TestUser | null = null;

test.describe("DOC-FINAL-ACCEPTANCE-1 — center destructive confirmation (live) @flag-on", () => {
  test.describe.configure({ timeout: 300_000 });

  test.beforeEach(async () => {
    expect(FLAG_ON, "requires ENABLE_DOCUMENT_BUILDER=true").toBe(true);
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      const id = testUser.id;
      testUser = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          await deleteTestUser(id);
          break;
        } catch (err) {
          if (attempt === 4) console.warn(`[doc-final cleanup] ${id}: ${(err as Error).message}`);
          else await new Promise((r) => setTimeout(r, 750));
        }
      }
    }
  });

  test("center destructive Apply: confirm gate, Cancel mutation-free, Confirm governed + checkpoint/history, undo/redo; rail-open + 400px stay usable", async ({
    page,
  }) => {
    const user = requireUser();
    await setAccountPlan(user.id, "pro");
    await signInViaEmailLink(page, user);
    const workflowId = await createWorkflow(page, "doc-final destructive");
    await seedEditableWorkflow(page, workflowId);
    const before = await readDefinition(page, workflowId);
    expect(before.nodes).toHaveLength(4);
    const beforeCheckpoints = await countCheckpoints(workflowId);
    const beforeChanges = await agentChangesCount(page, workflowId);

    await toDocument(page);
    // Document opens full-width with the rail collapsed (DOC-RAIL-LAYOUT-1).
    const rail = page.getByTestId("builder-left-agent-rail");
    await expect(rail).toHaveAttribute("data-collapsed", "true");

    // Submitting Ask React opens the ONE rail (expanded) — the confirmation will be
    // exercised with the rail OPEN here, then again with it COLLAPSED below.
    await askReactSubmit(page, "Remove the existing follow-up step");
    await expect(rail).toHaveAttribute("data-collapsed", "false");

    // The CENTER ghost preview marks the removal and the Apply names the consequence.
    const preview = page.getByTestId("document-preview");
    await expect(preview).toBeVisible({ timeout: 25_000 });
    await expect(preview).toHaveAttribute("data-destructive", "true");
    await expect(preview.locator('[data-status="removed"]')).toHaveCount(1);
    const applyBtn = page.getByTestId("document-preview-apply");
    await expect(applyBtn).toHaveText(/Apply removal/);
    await expect(applyBtn).toHaveAttribute("data-destructive", "true");
    await shot(page, "01-center-destructive-preview");

    // First click does NOT mutate — it opens the shared confirmation (rail OPEN).
    await applyBtn.click();
    const confirm = page.getByTestId("document-preview-destructive-confirm");
    await expect(confirm).toBeVisible();
    await expect(confirm).toHaveAttribute("role", "alertdialog");
    await expect(confirm).toHaveAccessibleName("Apply destructive change?");
    await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();
    expect((await readDefinition(page, workflowId)).nodes).toHaveLength(4);
    await shot(page, "02-center-destructive-confirmation");

    // Cancel → mutation-free, back to the preview.
    await page.getByTestId("document-preview-destructive-cancel").click();
    await expect(page.getByTestId("document-preview-destructive-confirm")).toHaveCount(0);
    await expect(page.getByTestId("document-preview-apply")).toBeVisible();
    await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();
    expect((await readDefinition(page, workflowId)).nodes).toHaveLength(4);
    expect(await countCheckpoints(workflowId)).toBe(beforeCheckpoints);

    // The confirmation stays usable with the Agent rail COLLAPSED (full-width Document).
    await page.getByTestId("builder-left-agent-rail-collapse").click();
    await expect(rail).toHaveAttribute("data-collapsed", "true");
    await page.getByTestId("document-preview-apply").click();
    await expect(page.getByTestId("document-preview-destructive-accept")).toBeVisible();
    await page.getByTestId("document-preview-destructive-cancel").click();
    await expect(page.getByTestId("document-preview-destructive-confirm")).toHaveCount(0);

    // Confirm → removal applies through the governed path (dirty, NOT auto-saved).
    await page.getByTestId("document-preview-apply").click();
    await page.getByTestId("document-preview-destructive-accept").click();
    await expect(page.getByTestId("document-preview")).toHaveCount(0);
    await expect(page.getByTestId("builder-header-save-button")).toBeEnabled();
    expect((await readDefinition(page, workflowId)).nodes).toHaveLength(4); // no auto-save
    await waitForCheckpointGrowth(workflowId, beforeCheckpoints);
    await waitForChangeGrowth(page, workflowId, beforeChanges);
    await shot(page, "03-center-destructive-applied");

    // Visual parity: the node is gone (3 pending nodes); undo restores, redo removes.
    await toVisual(page);
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(3);
    await page.getByTestId("builder-header-undo").click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(4);
    await page.getByTestId("builder-header-redo").click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(3);
    // Not persisted unless explicitly saved.
    expect((await readDefinition(page, workflowId)).nodes).toHaveLength(4);
  });

  test("stale destructive proposal: a real intervening edit makes the center confirm refuse — no mutation, no new checkpoint", async ({
    page,
  }) => {
    const user = requireUser();
    await setAccountPlan(user.id, "pro");
    await signInViaEmailLink(page, user);
    const workflowId = await createWorkflow(page, "doc-final stale destructive");
    await seedEditableWorkflow(page, workflowId);
    await toDocument(page);

    // Apply a REAL non-destructive edit first so the live draft moves to a new version
    // (5 pending nodes, one legitimate checkpoint). This is the baseline the destructive
    // proposal below will be version-pinned to.
    await askReactSubmit(page, "Change the existing notification message and add a follow-up step");
    await expect(page.getByTestId("document-preview")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("document-preview-apply").click(); // low-risk edit → one click
    await expect(page.getByTestId("document-preview")).toHaveCount(0);
    await toVisual(page);
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(5);
    await toDocument(page);

    // Open a DESTRUCTIVE proposal — version-pinned to the CURRENT (5-node) draft.
    await askReactSubmit(page, "Remove the existing follow-up step");
    await expect(page.getByTestId("document-preview")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("document-preview")).toHaveAttribute("data-destructive", "true");
    const baseCheckpoints = await countCheckpoints(workflowId);

    // A REAL manual graph change lands WHILE the proposal is open: Undo the first edit.
    // The live pending graph reverts to the 4-node version, so the open destructive proposal
    // (pinned to the 5-node version) is now STALE.
    await page.getByTestId("builder-header-undo").click();

    // Attempt to apply the now-stale destructive proposal through the CENTER confirmation.
    const previewOpen = await page.getByTestId("document-preview").isVisible().catch(() => false);
    await shot(page, "04-center-stale-refusal");
    if (previewOpen) {
      await page.getByTestId("document-preview-apply").click();
      const confirm = page.getByTestId("document-preview-destructive-confirm");
      if (await confirm.isVisible().catch(() => false)) {
        await page.getByTestId("document-preview-destructive-accept").click();
      }
    }

    // Settle, then prove the stale proposal NEVER applied: no NEW checkpoint beyond the
    // legitimate first apply (a successful apply always writes a checkpoint row).
    await page.waitForTimeout(2_500);
    expect(await countCheckpoints(workflowId), "no checkpoint for a refused stale destructive apply").toBe(
      baseCheckpoints,
    );

    // Not stuck: a fresh proposal against the current draft still previews.
    await askReactSubmit(page, "Remove the existing follow-up step");
    await expect(page.getByTestId("document-preview")).toBeVisible({ timeout: 25_000 });
  });

  test("Free account: entitlement is not bypassed by the destructive path (crafted branching save → 403)", async ({
    page,
  }) => {
    const user = requireUser();
    await expectAccountPlan(user.id, "free");
    await signInViaEmailLink(page, user);
    const workflowId = await createWorkflow(page, "doc-final free");
    await seedEditableWorkflow(page, workflowId);
    const before = await readDefinition(page, workflowId);

    // The server backstop still rejects a crafted advanced-branching save on Free — the
    // destructive-confirmation UI does not open any entitlement bypass.
    const craftedSave = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: {
        draftDefinition: {
          nodes: [
            { id: "t", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
            { id: "iff", kind: "action", provider: "native", type: "if_then_condition", config: { input: "x", operator: "is_not_empty", onFalse: "skip" }, position: { x: 0, y: 120 } },
          ],
          edges: [{ id: "e0", from: "t", to: "iff" }],
        },
      },
    });
    expect(craftedSave.status()).toBe(403);
    expect((await craftedSave.json()).code).toBe("PLAN_FEATURE_REQUIRED");
    expect(await readDefinition(page, workflowId)).toEqual(before);

    // An ordinary destructive proposal still previews on Free (removal is not gated) — but
    // still requires the confirmation before applying.
    await toDocument(page);
    await askReactSubmit(page, "Remove the existing follow-up step");
    await expect(page.getByTestId("document-preview")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("document-preview-apply").click();
    await expect(page.getByTestId("document-preview-destructive-confirm")).toBeVisible();
  });

  test("400px: the center destructive confirmation is fully reachable with no overflow", async ({
    page,
  }) => {
    const user = requireUser();
    await setAccountPlan(user.id, "pro");
    await signInViaEmailLink(page, user);
    const workflowId = await createWorkflow(page, "doc-final 400px");
    await seedEditableWorkflow(page, workflowId);
    await page.setViewportSize({ width: 400, height: 900 });

    await toDocument(page);
    await askReactSubmit(page, "Remove the existing follow-up step");
    await expect(page.getByTestId("document-preview")).toBeVisible({ timeout: 25_000 });
    // At 400px the expanded rail stacks full-width over the Document (DOC-RAIL-LAYOUT-1
    // mobile convention). Collapse it so the Document is the primary surface — the
    // center destructive confirmation must be fully reachable there.
    await page.getByTestId("builder-left-agent-rail-collapse").click();
    await expect(page.getByTestId("builder-left-agent-rail")).toHaveAttribute("data-collapsed", "true");
    await page.getByTestId("document-preview-apply").click();
    const confirm = page.getByTestId("document-preview-destructive-confirm");
    await expect(confirm).toBeVisible();
    await expect(page.getByTestId("document-preview-destructive-cancel")).toBeVisible();
    await expect(page.getByTestId("document-preview-destructive-accept")).toBeVisible();
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    );
    expect(noOverflow, "no horizontal overflow at 400px").toBe(true);
    await shot(page, "05-center-destructive-400px");
  });
});

// ── helpers ────────────────────────────────────────────────────────────────
function requireUser(): TestUser {
  if (!testUser) throw new Error("doc-final: test user setup failed");
  return testUser;
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
async function agentChangesCount(page: Page, workflowId: string): Promise<number> {
  const resp = await page.request.get(`/api/workflows/${workflowId}/agent-changes`);
  expect(resp.status()).toBe(200);
  return (((await resp.json()).items ?? []) as unknown[]).length;
}
async function countCheckpoints(workflowId: string): Promise<number> {
  const { count, error } = await adminClient()
    .from("workflow_checkpoints")
    .select("id", { count: "exact", head: true })
    .eq("workflow_id", workflowId);
  if (error) throw new Error(`countCheckpoints: ${error.message}`);
  return count ?? 0;
}
async function waitForCheckpointGrowth(workflowId: string, baseline: number): Promise<void> {
  await waitFor(async () => ((await countCheckpoints(workflowId)) > baseline ? true : null), {
    description: "checkpoint row after confirmed destructive apply",
    timeoutMs: 12_000,
  });
}
async function waitForChangeGrowth(page: Page, workflowId: string, baseline: number): Promise<void> {
  await waitFor(async () => ((await agentChangesCount(page, workflowId)) > baseline ? true : null), {
    description: "Agent change-history item after confirmed destructive apply",
    timeoutMs: 12_000,
  });
}
async function setAccountPlan(userId: string, plan: "free" | "pro"): Promise<void> {
  const admin = adminClient();
  const { data: account, error } = await admin
    .from("accounts").select("id").eq("owner_user_id", userId).single<{ id: string }>();
  if (error || !account) throw new Error(`setAccountPlan: ${error?.message}`);
  const { error: upErr } = await admin
    .from("account_billing").update({ plan, plan_status: "active" }).eq("account_id", account.id);
  if (upErr) throw new Error(`setAccountPlan: ${upErr.message}`);
}
async function expectAccountPlan(userId: string, plan: string): Promise<void> {
  const admin = adminClient();
  const { data: account } = await admin
    .from("accounts").select("id").eq("owner_user_id", userId).single<{ id: string }>();
  const { data: billing } = await admin
    .from("account_billing").select("plan").eq("account_id", account!.id).single<{ plan: string }>();
  expect(billing?.plan).toBe(plan);
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
async function toDocument(page: Page): Promise<void> {
  await page.getByTestId("builder-view-toggle-document").click();
  await expect(page.getByTestId("document-view")).toBeVisible();
}
async function toVisual(page: Page): Promise<void> {
  await page.getByTestId("builder-view-toggle-visual").click();
  await expect(page.getByTestId("workflow-node-view").first()).toBeVisible();
}
async function askReactSubmit(page: Page, goal: string): Promise<void> {
  await page.getByTestId("document-ask-react-input").fill(goal);
  await page.getByTestId("document-ask-react-submit").click();
  const composer = page.getByRole("textbox", { name: /Message React/i });
  await expect(composer).toHaveValue(
    new RegExp(goal.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  );
  await page.getByTestId("workflow-guidance-submit").click();
}
async function shot(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `owner-review/doc-final/${name}.png`, fullPage: true });
  } catch {
    /* evidence only */
  }
}
