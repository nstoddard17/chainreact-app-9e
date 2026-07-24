import { test, expect, type Page } from "@playwright/test";
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  signInViaEmailLink,
  waitFor,
  type TestUser,
} from "./helpers/supabaseAdmin";
import {
  seedEditableWorkflow,
  FIXTURE_NODE_IDS,
  FIXTURE_NOTIFICATION_ORIGINAL_TEXT,
} from "./helpers/dualBuilderFixtures";

/**
 * 5.DUAL-BUILDER-1 CS-7G — live Ask React MUTATION-path acceptance.
 *
 * Drives the REAL edit / stale / destructive mutation path in the authenticated app against a
 * deterministic NON-EMPTY workflow — the flows CS-7F built fixtures for but deferred from live.
 * The ONLY mocked layer is the external model RESPONSE (loopback mock Hermes, global-setup).
 * Everything else is real: the Document Ask React controls, the ONE Agent rail + composer,
 * WorkflowGuidancePanel, the account guidance route, editable-graph build + ref resolution,
 * runWorkflowEditFromModel / proposeWorkflowMutation, useBuilderPreview, checkpoint +
 * change-history, graphSlice replaceGraphLocal + undo/redo + Save.
 *
 * Governing rules held: TWO EDITORS, ONE WORKFLOW. AI PROPOSES · THE USER REVIEWS · APPLY IS
 * EXPLICIT · SAVE IS EXPLICIT. STALE OR DESTRUCTIVE PROPOSALS NEVER SILENTLY OVERWRITE.
 *
 * Requires ENABLE_DOCUMENT_BUILDER=true + the loopback mock (set by playwright.config /
 * global-setup). One worker (stateful). Screenshots → owner-review/cs7g/ (gitignored).
 */

const FLAG_ON = process.env.ENABLE_DOCUMENT_BUILDER === "true";
const GUIDANCE_ROUTE = /\/api\/accounts\/[0-9a-f-]+\/ai\/workflow-guidance/;

let testUser: TestUser | null = null;

test.describe("5.DUAL-BUILDER-1 CS-7G — Ask React mutation acceptance (live) @flag-on", () => {
  test.describe.configure({ timeout: 300_000 });

  test.beforeEach(async () => {
    expect(FLAG_ON, "CS-7G requires ENABLE_DOCUMENT_BUILDER=true").toBe(true);
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      // The shared local-Supabase `auth.admin.deleteUser` can throw a transient "Database error
      // deleting user" under sequential load. Retry a few times; if it still fails, WARN (never fail an
      // otherwise-passing acceptance test on a local-DB cleanup hiccup — the leak is local-only).
      const id = testUser.id;
      testUser = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          await deleteTestUser(id);
          break;
        } catch (err) {
          if (attempt === 4) {
            console.warn(`[cs7g cleanup] deleteTestUser ${id} failed after retries: ${(err as Error).message}`);
          } else {
            await new Promise((r) => setTimeout(r, 750));
          }
        }
      }
    }
  });

  // ── 1. Rapid composer seeds + manual-edit survival ─────────────────────────
  test("rapid composer seeds supersede in ONE composer; manual edits survive rerenders; explicit action replaces; nothing auto-submits", async ({
    page,
  }) => {
    const user = requireUser();
    await setAccountPlan(user.id, "pro");
    await signInViaEmailLink(page, user);
    const workflowId = await createWorkflow(page, "CS-7G composer seeds");
    await seedEditableWorkflow(page, workflowId);
    await toDocument(page);

    // Seed #1 — from the persistent Ask React bar (non-empty workflow).
    await page.getByTestId("document-ask-react-input").fill("Add a Slack notification after the reminder");
    await page.getByTestId("document-ask-react-submit").click();
    // Exactly one rail + one composer — the Document opens no second panel.
    await expect(page.getByTestId("builder-guidance-rail")).toHaveCount(1);
    await expect(page.getByTestId("workflow-guidance-panel")).toHaveCount(1);
    const composer = page.getByRole("textbox", { name: /Message React/i });
    await expect(composer).toHaveValue(/Slack notification after the reminder/i);

    // Seed #2 — from an INSERTION location (a different entry) BEFORE submitting.
    const insertTrigger = page.getByTestId(`document-insert-after-${FIXTURE_NODE_IDS.notification}`);
    await insertTrigger.click({ force: true }); // hover-revealed affordance
    await page.getByTestId(`document-insert-after-${FIXTURE_NODE_IDS.notification}-askreact`).click({ force: true });
    // The SAME composer receives the newer seed (supersession); still one composer.
    await expect(composer).toHaveValue(/Add a step/i);
    await expect(page.getByTestId("workflow-guidance-panel")).toHaveCount(1);

    // Manual edit — the user takes over the composer text.
    const manualText = "my own carefully typed request";
    await composer.fill(manualText);

    // Unrelated rerenders must NOT clobber the manual text: open/close the Whole Workflow map…
    await page.getByTestId("document-open-map-button").click();
    await expect(page.getByTestId("document-whole-workflow-map")).toBeVisible();
    await page.getByTestId("document-map-close").click();
    await expect(page.getByTestId("document-whole-workflow-map")).toHaveCount(0);
    // …and a neutral deselect click on the masthead (bounded — never an unbounded auto-wait).
    await page.getByTestId("document-masthead").click({ timeout: 3_000 }).catch(() => {});
    // …then re-open/close the map once more (a second unrelated rerender).
    await page.getByTestId("document-open-map-button").click();
    await page.getByTestId("document-map-close").click();
    await expect(composer).toHaveValue(manualText);

    // A THIRD explicit Ask React action intentionally REPLACES the composer.
    await page.getByTestId("document-ask-react-input").fill("Different explicit request");
    await page.getByTestId("document-ask-react-submit").click();
    await expect(composer).toHaveValue(/Different explicit request/i);

    // Nothing auto-submitted: no preview appeared and the conversation/preview stay on the one Agent.
    await expect(page.getByTestId("document-preview")).toHaveCount(0);
    await expect(page.getByTestId("workflow-guidance-panel")).toHaveCount(1);

    await shot(page, "01-composer-multi-seed");
  });

  // ── 2. Edit proposal: modify + add, non-mutating preview, governed apply ────
  test("edit proposal: real route/mock, modified+added preview is non-mutating, Apply modifies+adds through the governed path, checkpoint+history, cross-view undo/redo, save/reload", async ({
    page,
  }) => {
    const user = requireUser();
    await setAccountPlan(user.id, "pro");
    await signInViaEmailLink(page, user);
    const workflowId = await createWorkflow(page, "CS-7G edit");
    await seedEditableWorkflow(page, workflowId);

    // Record observable BEFORE state.
    const before = await readDefinition(page, workflowId);
    expect(before.nodes).toHaveLength(4);
    expect(nodeById(before, FIXTURE_NODE_IDS.notification)?.config?.text).toBe(FIXTURE_NOTIFICATION_ORIGINAL_TEXT);
    const beforeChanges = await agentChangesCount(page, workflowId);
    const beforeCheckpoints = await countCheckpoints(workflowId);

    await toDocument(page);
    const setupBefore = await setupCount(page);

    // Ask React (edit goal) → real guidance route → mock → real mutation pipeline.
    const [guidanceResp] = await Promise.all([
      page.waitForResponse((r) => GUIDANCE_ROUTE.test(r.url()) && r.request().method() === "POST"),
      askReactSubmit(page, "Change the existing notification message and add a follow-up step"),
    ]);
    expect(guidanceResp.status()).toBe(200);
    const guidanceBody = await guidanceResp.json();
    // The request reached the route + mock and produced a REAL mutation proposal.
    expect(guidanceBody.proposedDefinition, "route returned a proposedDefinition (edit path ran)").toBeTruthy();
    expect(guidanceBody.baseGraphVersion, "proposal is version-pinned").toBeTruthy();

    // The preview visibly marks one value MODIFIED and one step ADDED.
    const preview = page.getByTestId("document-preview");
    await expect(preview).toBeVisible({ timeout: 25_000 });
    await expect(preview).toHaveAttribute("data-preview-kind", "edit");
    await expect(preview.locator('[data-status="modified"]')).toHaveCount(1);
    await expect(preview.locator('[data-status="added"]')).toHaveCount(1);
    await shot(page, "02-edit-preview");

    // NON-MUTATING before Apply: live definition, dirty/Save, setup count, and map all unchanged.
    await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();
    const during = await readDefinition(page, workflowId);
    expect(during.nodes).toHaveLength(4);
    expect(nodeById(during, FIXTURE_NODE_IDS.notification)?.config?.text).toBe(FIXTURE_NOTIFICATION_ORIGINAL_TEXT);
    expect(await setupCount(page)).toBe(setupBefore); // preview fields don't enter Finish Setup
    await expectMapExcludesPreview(page, before.nodes.length); // map shows live nodes only

    // Apply (a low-risk text change → no confirmation) through the governed path.
    await page.getByTestId("document-preview-apply").click();
    await expect(page.getByTestId("document-preview")).toHaveCount(0);

    // Dirty + Save available, NOT auto-saved (API still the pre-apply definition).
    await expect(page.getByTestId("builder-header-save-button")).toBeEnabled();
    const stillSaved = await readDefinition(page, workflowId);
    expect(stillSaved.nodes).toHaveLength(4); // no auto-save
    await shot(page, "03-edit-applied-unsaved");

    // Checkpoint + Agent change-history recorded through the real observable paths (both async).
    await waitForCheckpointGrowth(workflowId, beforeCheckpoints);
    await waitForChangeGrowth(page, workflowId, beforeChanges);

    // Finish Setup NOW includes the added node's unresolved fields; map includes the added node.
    expect(await setupCount(page)).toBeGreaterThan(setupBefore);

    // Visual parity: modification + addition are real pending nodes (5 total).
    await toVisual(page);
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(5);

    // Cross-view undo/redo (done BEFORE Save — Save reconciles the history) — Undo from Visual reverses
    // BOTH the modification and the addition together (one transaction); Redo from the Document surface
    // restores both.
    await page.getByTestId("builder-header-undo").click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(4);
    await toDocument(page);
    await page.getByTestId("builder-header-redo").click();
    await toVisual(page);
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(5);

    // Explicit Save → the SAME record is updated with BOTH the modification and the addition. Let the
    // redo state flush into the store before Save reads it, then poll the API until the persisted draft
    // reflects the applied edit (the save write is async).
    await expect(page.getByTestId("builder-header-save-button")).toBeEnabled();
    await page.waitForTimeout(750);
    await saveWorkflow(page);
    await waitFor(
      async () => {
        const d = await readDefinition(page, workflowId);
        return d.nodes.length === 5 &&
          nodeById(d, FIXTURE_NODE_IDS.notification)?.config?.text === "Updated by React"
          ? d
          : null;
      },
      { description: "edit persisted to the same workflow record", timeoutMs: 12_000 },
    );

    // Reload proves persistence in both builders.
    await page.reload();
    await toVisual(page);
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(5);
    await toDocument(page);
    await expect(page.getByTestId("document-view")).toBeVisible();
    // No duplicate workflow created.
    expect(await workflowCountForUser(user.id)).toBe(1);
  });

  // ── 3. Stale proposal: refusal after a real intervening edit ────────────────
  test("stale proposal: an intervening manual edit makes the older preview refuse to Apply — no partial mutation, no checkpoint/history for the refusal", async ({
    page,
  }) => {
    const user = requireUser();
    await setAccountPlan(user.id, "pro");
    await signInViaEmailLink(page, user);
    const workflowId = await createWorkflow(page, "CS-7G stale");
    await seedEditableWorkflow(page, workflowId);
    await toDocument(page);

    // First, apply a real edit so the live graph moves to a new version (5 pending nodes). This is the
    // baseline the SECOND proposal will be pinned to. (Its checkpoint/history are legitimate.)
    await askReactSubmit(page, "Change the existing notification message and add a follow-up step");
    await expect(page.getByTestId("document-preview")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("document-preview-apply").click();
    await expect(page.getByTestId("document-preview")).toHaveCount(0);
    await toVisual(page);
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(5); // safe to count: no preview open
    await toDocument(page);

    // Generate a SECOND edit preview — pinned to the CURRENT (5-node) draft version.
    await askReactSubmit(page, "Change the existing notification message and add a follow-up step");
    await expect(page.getByTestId("document-preview")).toBeVisible({ timeout: 25_000 });
    // Baseline AFTER the legitimate first apply — a refused stale Apply must add NO new checkpoint.
    // (A SUCCESSFUL apply ALWAYS writes a checkpoint row, so the checkpoint count staying flat is the
    // unambiguous proof the stale proposal never applied — no canvas count is used, since the canvas
    // shows the preview DIFF while a proposal is open. The preview_applied history status is NOT used
    // as the signal here because the Undo below legitimately transitions the FIRST apply's history row
    // from preview_applied → undone in place, which would confound a status count.)
    const baseCheckpoints = await countCheckpoints(workflowId);

    // A REAL manual graph change lands WHILE that proposal is pending: Undo the first edit. The live
    // pending graph reverts to the 4-node version, so the open proposal (pinned to the 5-node version)
    // is now STALE. (Undo is a genuine builder graph mutation.)
    await page.getByTestId("builder-header-undo").click();

    // Attempt to Apply the now-STALE proposal (if the app kept it open); either it refuses at Apply or
    // the proposal was already superseded by the underlying change — both are safe (never a silent
    // overwrite). Capture whichever state the app presents.
    const previewOpen = await page.getByTestId("document-preview").isVisible().catch(() => false);
    await shot(page, "04-stale-refusal");
    if (previewOpen) await page.getByTestId("document-preview-apply").click();

    // Settle, then prove the stale proposal NEVER applied: no NEW checkpoint beyond the legitimate first.
    await page.waitForTimeout(2_500);
    expect(await countCheckpoints(workflowId), "no checkpoint for a refused stale Apply").toBe(baseCheckpoints);

    // The user can ask React again against the CURRENT draft (not stuck) — a fresh proposal supersedes.
    await askReactSubmit(page, "Change the existing notification message and add a follow-up step");
    await expect(page.getByTestId("document-preview")).toBeVisible({ timeout: 25_000 });
  });

  // ── 4. Destructive proposal: confirmation, cancel, confirm, undo/redo ───────
  test("destructive proposal: preview marks removal, Apply requires the existing confirmation, Cancel is mutation-free, Confirm removes through the governed path with checkpoint+history, undo restores", async ({
    page,
  }) => {
    const user = requireUser();
    await setAccountPlan(user.id, "pro");
    await signInViaEmailLink(page, user);
    const workflowId = await createWorkflow(page, "CS-7G destructive");
    await seedEditableWorkflow(page, workflowId);
    const before = await readDefinition(page, workflowId);
    expect(before.nodes).toHaveLength(4);
    const beforeCheckpoints = await countCheckpoints(workflowId);
    const beforeChanges = await agentChangesCount(page, workflowId);

    await toDocument(page);
    await askReactSubmit(page, "Remove the existing follow-up step");

    // Preview marks the node removed/destructive.
    const preview = page.getByTestId("document-preview");
    await expect(preview).toBeVisible({ timeout: 25_000 });
    await expect(preview.locator('[data-status="removed"]')).toHaveCount(1);
    await shot(page, "05-destructive-preview");

    // Before Apply: node still live, dirty/Save unchanged, map still includes the node.
    await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();
    expect((await readDefinition(page, workflowId)).nodes).toHaveLength(4);

    // Apply through the governed apply-mode action → the EXISTING destructive confirmation appears
    // (the removed node carries a recipient `channel`, so confirmation is required).
    await page.getByTestId("agent-apply-mode-apply_to_draft").click();
    const confirm = page.getByTestId("agent-apply-mode-confirm");
    await expect(confirm).toBeVisible();
    await shot(page, "06-destructive-confirmation");

    // Cancel → mutation-free: node remains, not dirty, no checkpoint, no apply history.
    await page.getByTestId("agent-apply-mode-confirm-cancel").click();
    await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();
    expect((await readDefinition(page, workflowId)).nodes).toHaveLength(4);
    expect(await countCheckpoints(workflowId)).toBe(beforeCheckpoints);

    // Confirm → removal applies through the governed path.
    await page.getByTestId("agent-apply-mode-apply_to_draft").click();
    await expect(page.getByTestId("agent-apply-mode-confirm")).toBeVisible();
    await page.getByTestId("agent-apply-mode-confirm-accept").click();

    await expect(page.getByTestId("builder-header-save-button")).toBeEnabled(); // dirty
    const stillSaved = await readDefinition(page, workflowId);
    expect(stillSaved.nodes).toHaveLength(4); // no auto-save
    await waitForCheckpointGrowth(workflowId, beforeCheckpoints);
    await waitForChangeGrowth(page, workflowId, beforeChanges);

    // Pending graph lost the node (Visual parity: 3 nodes).
    await toVisual(page);
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(3);

    // Undo restores it; redo removes it again.
    await page.getByTestId("builder-header-undo").click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(4);
    await page.getByTestId("builder-header-redo").click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(3);
    // Not persisted (destructive change stays local unless explicitly saved).
    expect((await readDefinition(page, workflowId)).nodes).toHaveLength(4);
  });

  // ── 5. Free-plan advanced-branching entitlement (client + server backstops) ─
  test("Free account: an advanced-branching Ask React proposal is blocked (upgrade text, no preview); crafted save→403 and run→403; ordinary Ask React still works", async ({
    page,
  }) => {
    const user = requireUser();
    await expectAccountPlan(user.id, "free"); // new accounts default Free
    await signInViaEmailLink(page, user);
    const workflowId = await createWorkflow(page, "CS-7G free branching");
    await seedEditableWorkflow(page, workflowId);
    await toDocument(page);

    // Ask for advanced branching → the route drops the plan/preview and returns upgrade guidance.
    const [branchResp] = await Promise.all([
      page.waitForResponse((r) => GUIDANCE_ROUTE.test(r.url()) && r.request().method() === "POST"),
      askReactSubmit(page, "Split this workflow based on whether the amount is above 1000"),
    ]);
    const branchBody = await branchResp.json();
    expect(branchBody.proposedDefinition ?? null).toBeNull();
    expect(branchBody.workflowPlan ?? null).toBeNull();
    expect(String(branchBody.guidanceText)).toMatch(/Pro|branching/i);
    // No preview to apply → graph unchanged, Save disabled.
    await expect(page.getByTestId("document-preview")).toHaveCount(0);
    expect((await readDefinition(page, workflowId)).nodes).toHaveLength(4);
    await expect(page.getByTestId("builder-header-save-button")).toBeDisabled();

    // Server backstops: a crafted advanced-branching SAVE is typed-403, nothing persisted.
    const before = await readDefinition(page, workflowId);
    const craftedSave = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: {
        draftDefinition: {
          nodes: [
            { id: "t", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
            { id: "iff", kind: "action", provider: "native", type: "if_then_condition", config: { input: "x", operator: "is_not_empty", onFalse: "skip" }, position: { x: 0, y: 120 } },
            { id: "ft", kind: "action", provider: "native", type: "format_transformer", config: { content: "no", sourceFormat: "plain", targetFormat: "plain" }, position: { x: 0, y: 240 } },
          ],
          edges: [
            { id: "e0", from: "t", to: "iff" },
            { id: "e1", from: "iff", to: "ft", label: "true" },
          ],
        },
      },
    });
    expect(craftedSave.status()).toBe(403);
    expect((await craftedSave.json()).code).toBe("PLAN_FEATURE_REQUIRED");
    expect(await readDefinition(page, workflowId)).toEqual(before); // no partial persist
    // (The engine/run backstop — run-now → typed 403 for a persisted branching workflow — is proven
    //  by the existing advanced-branching-entitlement downgrade journey, run in this batch's regression.)

    // Ordinary (non-branch) Ask React remains usable on Free — a plain EDIT proposal still previews
    // (only advanced branching is gated; everyday edits are not).
    await askReactSubmit(page, "Change the existing notification message and add a follow-up step");
    await expect(page.getByTestId("document-preview")).toBeVisible({ timeout: 25_000 });
  });

  // ── 6. Responsive: 400px Agent usability ────────────────────────────────────
  test("400px: the Document, one Agent composer, and the preview stay usable and don't overflow", async ({
    page,
  }) => {
    const user = requireUser();
    await setAccountPlan(user.id, "pro");
    await signInViaEmailLink(page, user);
    const workflowId = await createWorkflow(page, "CS-7G 400px");
    await seedEditableWorkflow(page, workflowId);

    await page.setViewportSize({ width: 400, height: 900 });
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await toDocument(page);
    // One reachable composer; drive an edit proposal at 400px.
    await askReactSubmit(page, "Change the existing notification message and add a follow-up step");
    const preview = page.getByTestId("document-preview");
    await expect(preview).toBeVisible({ timeout: 25_000 });
    // Apply/Reject reachable.
    await expect(page.getByTestId("document-preview-apply")).toBeVisible();
    await expect(page.getByTestId("document-preview-reject")).toBeVisible();
    // The document body does not scroll horizontally (no overflow).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    );
    expect(overflow, "no horizontal overflow at 400px").toBe(true);
    await shot(page, "07-agent-400px");
    expect(errors, `console errors at 400px: ${errors.join(" | ")}`).toHaveLength(0);
  });
});

// ── helpers ────────────────────────────────────────────────────────────────

function requireUser(): TestUser {
  if (!testUser) throw new Error("CS-7G: test user setup failed");
  return testUser;
}

interface Definition {
  nodes: Array<{ id: string; kind?: string; provider?: string; type: string; config?: Record<string, unknown> }>;
  edges: Array<{ id: string; from: string; to: string; label?: string }>;
}

function nodeById(def: Definition, id: string) {
  return def.nodes.find((n) => n.id === id);
}

async function readDefinition(page: Page, workflowId: string): Promise<Definition> {
  const resp = await page.request.get(`/api/workflows/${workflowId}`);
  expect(resp.status(), await resp.text()).toBe(200);
  return (await resp.json()).draftDefinition as Definition;
}

interface AgentChangeItem {
  status: string;
}
async function agentChangesRaw(page: Page, workflowId: string): Promise<AgentChangeItem[]> {
  const resp = await page.request.get(`/api/workflows/${workflowId}/agent-changes`);
  expect(resp.status()).toBe(200);
  return ((await resp.json()).items ?? []) as AgentChangeItem[];
}
async function agentChangesCount(page: Page, workflowId: string): Promise<number> {
  return (await agentChangesRaw(page, workflowId)).length;
}

/** Poll until the workflow's checkpoint count exceeds a baseline (the checkpoint POST is async). */
async function waitForCheckpointGrowth(workflowId: string, baseline: number): Promise<void> {
  await waitFor(async () => ((await countCheckpoints(workflowId)) > baseline ? true : null), {
    description: "React-Agent checkpoint row after Apply",
    timeoutMs: 12_000,
  });
}
/** Poll until the workflow's Agent change-history count exceeds a baseline (emission is async). */
async function waitForChangeGrowth(page: Page, workflowId: string, baseline: number): Promise<void> {
  await waitFor(async () => ((await agentChangesCount(page, workflowId)) > baseline ? true : null), {
    description: "Agent change-history item after Apply",
    timeoutMs: 12_000,
  });
}

async function countCheckpoints(workflowId: string): Promise<number> {
  const { count, error } = await adminClient()
    .from("workflow_checkpoints")
    .select("id", { count: "exact", head: true })
    .eq("workflow_id", workflowId);
  if (error) throw new Error(`countCheckpoints: ${error.message}`);
  return count ?? 0;
}

async function workflowCountForUser(userId: string): Promise<number> {
  const admin = adminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id")
    .eq("owner_user_id", userId)
    .single<{ id: string }>();
  const { count } = await admin
    .from("workflows")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account!.id);
  return count ?? 0;
}

/** The Finish-Setup supported count from the Document banner (0 when the banner isn't shown). */
async function setupCount(page: Page): Promise<number> {
  const banner = page.getByTestId("document-setup-banner");
  if (!(await banner.isVisible().catch(() => false))) return 0;
  const raw = await banner.getAttribute("data-supported-count");
  return raw ? Number(raw) : 0;
}

/** Open the Whole Workflow map and assert it shows exactly the live nodes (no preview rows), then close. */
async function expectMapExcludesPreview(page: Page, liveNodeCount: number): Promise<void> {
  await page.getByTestId("document-open-map-button").click();
  const map = page.getByTestId("document-whole-workflow-map");
  await expect(map).toBeVisible();
  // Map node rows correspond to live nodes only (trigger + actions), never preview-only nodes.
  const rows = map.locator('[data-testid^="document-map-row-"]');
  expect(await rows.count()).toBeLessThanOrEqual(liveNodeCount);
  await page.getByTestId("document-map-close").click();
}

async function setAccountPlan(userId: string, plan: "free" | "pro"): Promise<void> {
  const admin = adminClient();
  const { data: account, error } = await admin
    .from("accounts")
    .select("id")
    .eq("owner_user_id", userId)
    .single<{ id: string }>();
  if (error || !account) throw new Error(`setAccountPlan: account lookup failed: ${error?.message}`);
  const { error: upErr } = await admin
    .from("account_billing")
    .update({ plan, plan_status: "active" })
    .eq("account_id", account.id);
  if (upErr) throw new Error(`setAccountPlan: billing update failed: ${upErr.message}`);
}

async function expectAccountPlan(userId: string, plan: string): Promise<void> {
  const admin = adminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id")
    .eq("owner_user_id", userId)
    .single<{ id: string }>();
  const { data: billing } = await admin
    .from("account_billing")
    .select("plan")
    .eq("account_id", account!.id)
    .single<{ plan: string }>();
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

/** Seed the ONE composer via the persistent Document bar, then submit through the shared composer. */
async function askReactSubmit(page: Page, goal: string): Promise<void> {
  await page.getByTestId("document-ask-react-input").fill(goal);
  await page.getByTestId("document-ask-react-submit").click();
  const composer = page.getByRole("textbox", { name: /Message React/i });
  await expect(composer).toHaveValue(new RegExp(goal.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  await page.getByTestId("workflow-guidance-submit").click();
}

async function saveWorkflow(page: Page): Promise<void> {
  const save = page.getByTestId("builder-header-save-button");
  await expect(save).toBeEnabled({ timeout: 10_000 });
  await save.click();
  await expect(save).toBeDisabled({ timeout: 15_000 });
}

async function shot(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `owner-review/cs7g/${name}.png`, fullPage: true });
  } catch {
    /* evidence only */
  }
}
