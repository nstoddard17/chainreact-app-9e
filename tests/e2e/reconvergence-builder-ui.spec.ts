import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  getWorkflowRunsForUser,
  signInViaEmailLink,
  waitFor,
  type TestUser,
} from "./helpers/supabaseAdmin";

/**
 * RECONV-1 S4 — diverge-and-reconverge built THROUGH THE REAL BUILDER UI.
 *
 * The engine's OR-merge reconvergence is unit-proven (RECONV-1 S1) and the
 * background pipeline is covered by
 * tests/unit/services/execution/reconvergence-background-e2e.test.ts. What no
 * spec proved yet: that an ordinary author can CONSTRUCT a reconverged diamond
 * with the canvas itself. Existing specs (advanced-branching-entitlement,
 * native-nodes slice-3 walkthrough) PATCH the draftDefinition via the API;
 * this spec's hard requirement is the opposite — every edge of the diamond
 * that matters is created by real React Flow interactions:
 *
 *   - nodes come from the real library pickers (trigger picker + action picker),
 *     which auto-wire a linear chain: trigger → if → A → B → shared;
 *   - the three auto-created chain edges that don't belong in a diamond
 *     (if→A, A→B, B→shared) are deleted by real canvas interaction
 *     (click the edge path → keyboard Backspace);
 *   - the FOUR diamond edges — if `branch:true` → A, if `branch:false` → B,
 *     and BOTH rejoin edges A → shared and B → shared — are created by real
 *     `page.mouse` handle drags (source-handle press → move → drop on the
 *     target handle). NO API PATCH touches the definition anywhere.
 *
 * Node configs are entered through the real config drawer (Setup tab fields +
 * the drawer's Save), persistence goes through the real header Save button,
 * and both routes are then executed against the durable-queue run path:
 * run 1 (condition TRUE) → True action ran / False action skipped / shared ran
 * exactly once; run 2 (condition FALSE) → mirrored.
 *
 * Assertion-only API use (allowed): GET /api/workflows/:id to read back the
 * persisted definition, POST /run-now to dispatch runs, service-role read of
 * workflow_runs. Same harness as the sibling specs: email-link sign-in around
 * the CAPTCHA, Pro-plan stamping (If/Then is Pro-gated), onboarding-overlay
 * dismissal, toolbar-scoped Create, TERMINAL-status run polling.
 */

let testUser: TestUser | null = null;

test.describe("RECONV-1 S4 — reconvergence built through the real builder UI", () => {
  // One long single-journey test: sign-in → build 5 nodes → configure 4 →
  // rewire the diamond by hand → save → reload → activate → two runs.
  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async () => {
    testUser = await createTestUser();
    // If/Then Condition is a Pro capability (BRANCH-ENT-1); this spec certifies
    // CANVAS authoring + routing, not billing, so stamp the throwaway personal
    // account Pro — same fixture as the slice-3 walkthrough.
    const admin = adminClient();
    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("owner_user_id", testUser.id)
      .single<{ id: string }>();
    if (!account) throw new Error("reconv spec: personal account not found");
    const { error } = await admin
      .from("account_billing")
      .update({ plan: "pro", plan_status: "active" })
      .eq("account_id", account.id);
    if (error) throw new Error(`reconv spec: pro-plan stamp failed: ${error.message}`);
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("author a diamond with handle drags; rejoin edges survive save/reload; both routes execute with the shared node running exactly once", async ({
    page,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    await signInViaEmailLink(page, user);

    const workflowId = await createWorkflow(page, "E2E RECONV-1 diamond via UI");

    // ── 1. Nodes via the real library pickers (auto-wired linear chain) ────
    await page.getByRole("button", { name: "Choose a trigger" }).click();
    await page.getByRole("button", { name: /Manual Trigger/ }).click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(1);
    const triggerId = (await listNodeIds(page))[0]!;

    const ifId = await addActionFromLibrary(page, "If/Then", /If\/Then Condition/, 2);
    // The branching card exposes the labeled route handles (True/False/Always).
    await expect(page.getByTestId("branch-handle-captions")).toContainText("True");
    await expect(page.getByTestId("branch-handle-captions")).toContainText("False");

    const aId = await addActionFromLibrary(page, "Format Transformer", /Format Transformer/, 3);
    const bId = await addActionFromLibrary(page, "Format Transformer", /Format Transformer/, 4);
    const sharedId = await addActionFromLibrary(page, "Format Transformer", /Format Transformer/, 5);
    // The picker auto-wired the linear chain trigger → if → A → B → shared.
    await expect(edgeGroup(page, ifId, aId)).toHaveCount(1);
    await expect(edgeGroup(page, aId, bId)).toHaveCount(1);
    await expect(edgeGroup(page, bId, sharedId)).toHaveCount(1);

    // ── 2. Configure all four nodes through the real config drawer ─────────
    await fitView(page);
    await openNodeConfig(page, ifId);
    await page.getByRole("textbox", { name: "Value to check", exact: true }).fill("{{trigger.payload.inputs.status}}");
    await pickSelectOption(page, "Condition", "equals");
    await page.getByRole("textbox", { name: "Compare against", exact: true }).fill("active");
    await saveNodeConfig(page);

    await openNodeConfig(page, aId);
    await page.getByRole("textbox", { name: "Content", exact: true }).fill("TRUE route ran");
    await pickSelectOption(page, "Target Format", "Plain text");
    await saveNodeConfig(page);

    await openNodeConfig(page, bId);
    await page.getByRole("textbox", { name: "Content", exact: true }).fill("FALSE route ran");
    await pickSelectOption(page, "Target Format", "Plain text");
    await saveNodeConfig(page);

    await openNodeConfig(page, sharedId);
    await page.getByRole("textbox", { name: "Content", exact: true }).fill("SHARED ran");
    await pickSelectOption(page, "Target Format", "Plain text");
    await saveNodeConfig(page);

    await page.getByRole("button", { name: "Close drawer" }).click();

    // ── 3. Rewire into a diamond with real canvas interactions ─────────────
    // The default chain layout leaves ~20px between cards, hiding the edges
    // behind the cards and the on-edge "+" button — spread the actions apart
    // with REAL node drags first (diamond shape: A left, B right, shared low).
    await fitView(page);
    await dragNodeBy(page, aId, -170, 60);
    await dragNodeBy(page, bId, 170, -20);
    await dragNodeBy(page, sharedId, 0, 160);
    await fitView(page);

    // Delete the linear-chain edges (click the edge path → Backspace).
    await deleteEdgeViaCanvas(page, ifId, aId);
    await deleteEdgeViaCanvas(page, aId, bId);
    await deleteEdgeViaCanvas(page, bId, sharedId);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1); // trigger→if only

    // The four diamond edges — REAL handle drags (the spec's core requirement).
    await dragConnect(page, branchHandle(page, ifId, "branch:true"), targetHandle(page, aId));
    await expect(edgeGroup(page, ifId, aId)).toHaveCount(1);
    await dragConnect(page, branchHandle(page, ifId, "branch:false"), targetHandle(page, bId));
    await expect(edgeGroup(page, ifId, bId)).toHaveCount(1);
    await dragConnect(page, sourceHandle(page, aId), targetHandle(page, sharedId));
    await expect(edgeGroup(page, aId, sharedId)).toHaveCount(1);
    await dragConnect(page, sourceHandle(page, bId), targetHandle(page, sharedId));
    await expect(edgeGroup(page, bId, sharedId)).toHaveCount(1);
    await expect(page.locator(".react-flow__edge")).toHaveCount(5);

    // On-edge route pills render for the labeled branch edges.
    await expect(page.locator('[data-testid^="workflow-edge-label-"]')).toHaveCount(2);
    await expect(
      page.locator('[data-testid^="workflow-edge-label-"]', { hasText: /^True$/i }),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-testid^="workflow-edge-label-"]', { hasText: /^False$/i }),
    ).toHaveCount(1);

    // ── 4. Persist via the real header Save; reload; both rejoins survive ──
    // The header Save PATCHes asynchronously; while in flight the button reads
    // "Saving…" (also disabled). Wait for it to settle back to "Save" AND
    // disabled — that is isSaving=false + isDirty=false, i.e. the write committed.
    const saveButton = page.getByTestId("builder-header-save-button");
    await saveButton.click();
    await expect(saveButton).toHaveText("Save", { timeout: 15_000 });
    await expect(saveButton).toBeDisabled();

    const persisted = await readDefinition(page, workflowId);
    assertDiamond(persisted, { triggerId, ifId, aId, bId, sharedId });

    await page.reload();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(5);
    // Route pills survived persistence + reload.
    await expect(page.locator('[data-testid^="workflow-edge-label-"]')).toHaveCount(2);
    const reloaded = await readDefinition(page, workflowId);
    assertDiamond(reloaded, { triggerId, ifId, aId, bId, sharedId });

    // ── 5. Activate + run both routes through the durable queue ────────────
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible({
      timeout: 10_000,
    });

    // Run 1 — TRUE: A runs, B persists skipped, shared exactly once.
    await runNow(page, workflowId, { inputs: { status: "active" } });
    const run1 = await pollRun(user.id, 1);
    expect(run1.status, JSON.stringify(run1, null, 2)).toBe("succeeded");
    const steps1 = run1.steps;
    const byNode1 = new Map(steps1.map((s) => [s.nodeId, s]));
    expect(byNode1.get(triggerId)!.status).toBe("succeeded");
    expect(byNode1.get(ifId)!.status).toBe("succeeded");
    expect(byNode1.get(aId)!.status).toBe("succeeded");
    expect(byNode1.get(bId)!.status).toBe("skipped");
    expect(byNode1.get(bId)!.output).toBeUndefined();
    expect(steps1.filter((s) => s.nodeId === sharedId)).toHaveLength(1);
    expect(byNode1.get(sharedId)!.status).toBe("succeeded");
    expect(
      (byNode1.get(sharedId)!.output as { transformedContent?: string })
        .transformedContent,
    ).toBe("SHARED ran");

    // Run 2 — FALSE: mirrored.
    await runNow(page, workflowId, { inputs: { status: "inactive" } });
    const run2 = await pollRun(user.id, 2);
    expect(run2.status, JSON.stringify(run2, null, 2)).toBe("succeeded");
    const steps2 = run2.steps;
    const byNode2 = new Map(steps2.map((s) => [s.nodeId, s]));
    expect(byNode2.get(bId)!.status).toBe("succeeded");
    expect(byNode2.get(aId)!.status).toBe("skipped");
    expect(byNode2.get(aId)!.output).toBeUndefined();
    expect(steps2.filter((s) => s.nodeId === sharedId)).toHaveLength(1);
    expect(byNode2.get(sharedId)!.status).toBe("succeeded");
  });
});

// ── canvas helpers ─────────────────────────────────────────────────────────

async function listNodeIds(page: Page): Promise<string[]> {
  return page
    .locator(".react-flow__node")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-id") ?? ""));
}

/**
 * React Flow edge elements carry no data-id, but expose a stable
 * accessibility label "Edge from <sourceId> to <targetId>" — deterministic
 * edge identity without diffing.
 */
function edgeGroup(page: Page, fromId: string, toId: string): Locator {
  return page.locator(
    `.react-flow__edge[aria-label="Edge from ${fromId} to ${toId}"]`,
  );
}

function diffOne(before: string[], after: string[]): string {
  const added = after.filter((id) => !before.includes(id));
  if (added.length !== 1) {
    throw new Error(
      `expected exactly one new canvas element, got [${added.join(", ")}]`,
    );
  }
  return added[0]!;
}

/**
 * Add an action through the real library picker (global "+ Add action" CTA →
 * search → row click) and return the new node's canvas id.
 */
async function addActionFromLibrary(
  page: Page,
  searchText: string,
  rowName: RegExp,
  expectedNodeCount: number,
): Promise<string> {
  const before = await listNodeIds(page);
  await page.getByRole("button", { name: "+ Add action" }).click();
  await page.getByLabel("Search add-node panel").fill(searchText);
  await page.getByRole("button", { name: rowName }).first().click();
  await expect(page.getByTestId("add-node-panel")).toBeHidden();
  await expect(page.getByTestId("workflow-node-view")).toHaveCount(expectedNodeCount);
  return diffOne(before, await listNodeIds(page));
}

async function fitView(page: Page): Promise<void> {
  await page.locator(".react-flow__controls-fitview").click();
  // Give the viewport transform a moment to settle before measuring boxes.
  await page.waitForTimeout(300);
}

async function openNodeConfig(page: Page, nodeId: string): Promise<void> {
  await nodeCard(page, nodeId).click({ position: { x: 30, y: 30 } });
  await expect(
    page.getByRole("complementary", { name: "Node configuration" }),
  ).toBeVisible();
}

async function saveNodeConfig(page: Page): Promise<void> {
  const save = page.getByTestId("config-modal-save-button");
  await save.click();
  await expect(save).toBeDisabled(); // draft committed → "No changes"
}

/** Radix single-select: open via its labeled trigger, pick the named option. */
async function pickSelectOption(
  page: Page,
  fieldLabel: string,
  optionName: string,
): Promise<void> {
  await page.getByLabel(fieldLabel, { exact: true }).click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

function nodeCard(page: Page, nodeId: string): Locator {
  return page.locator(`.react-flow__node[data-id="${nodeId}"]`);
}

function targetHandle(page: Page, nodeId: string): Locator {
  return nodeCard(page, nodeId).locator(".react-flow__handle.target");
}

function sourceHandle(page: Page, nodeId: string): Locator {
  return nodeCard(page, nodeId).locator(".react-flow__handle.source");
}

function branchHandle(page: Page, nodeId: string, handleId: string): Locator {
  return nodeCard(page, nodeId).locator(
    `.react-flow__handle.source[data-handleid="${handleId}"]`,
  );
}

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box (off-screen?)");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Real React Flow connection drag: press the source handle, move in steps to
 * the target handle, release on its center. `page.mouse` only — this IS the
 * interaction an author performs.
 */
async function dragConnect(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  const before = await page.locator(".react-flow__edge").count();
  const s = await centerOf(source);
  const t = await centerOf(target);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.mouse.move((s.x + t.x) / 2, (s.y + t.y) / 2, { steps: 10 });
  await page.mouse.move(t.x, t.y, { steps: 10 });
  await page.mouse.move(t.x, t.y);
  await page.mouse.up();
  await expect
    .poll(async () => page.locator(".react-flow__edge").count(), {
      message: "handle drag should create exactly one new edge",
      timeout: 5_000,
    })
    .toBe(before + 1);
}

/**
 * Real node drag: grab the card (away from its hover quick-actions) and move
 * it by a screen-pixel delta so the diamond has room between its cards.
 */
async function dragNodeBy(
  page: Page,
  nodeId: string,
  dx: number,
  dy: number,
): Promise<void> {
  const grab = await nodeCard(page, nodeId).boundingBox();
  if (!grab) throw new Error("node drag: missing bounding box");
  const from = { x: grab.x + 30, y: grab.y + 30 };
  const to = { x: from.x + dx, y: from.y + dy };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

/**
 * Delete an edge with real canvas interaction: click a point ON the edge path
 * (30% along its length — clear of the midpoint "+" insert button), then press
 * Backspace. Edges-only keyboard deletes proceed without a confirm dialog.
 */
async function deleteEdgeViaCanvas(
  page: Page,
  fromId: string,
  toId: string,
): Promise<void> {
  // React Flow edges are focusable <g> elements (role=group, tabIndex 0) with a
  // keyboard handler that SELECTS on Enter and unselects on Escape — far more
  // robust than clicking a curved SVG path whose midpoint the on-edge "+" button
  // covers. Focus the edge, press Enter to select, Backspace to delete (the
  // canvas's edges-only keyboard-delete path: onBeforeDelete → onEdgesDelete →
  // removeEdge). This IS a real keyboard interaction, not an API mutation.
  const edge = edgeGroup(page, fromId, toId);
  await expect(edge).toHaveCount(1);
  await edge.focus();
  await page.keyboard.press("Enter");
  await expect(edge).toHaveClass(/selected/);
  await page.keyboard.press("Backspace");
  await expect(edgeGroup(page, fromId, toId)).toHaveCount(0);
}

// ── definition + run helpers ───────────────────────────────────────────────

interface DefinitionEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

interface Definition {
  nodes: Array<{ id: string; kind: string; type: string }>;
  edges: DefinitionEdge[];
}

async function readDefinition(page: Page, workflowId: string): Promise<Definition> {
  const resp = await page.request.get(`/api/workflows/${workflowId}`);
  expect(resp.status(), await resp.text()).toBe(200);
  return (await resp.json()).draftDefinition as Definition;
}

/** The persisted graph is exactly the UI-authored diamond, rejoins included. */
function assertDiamond(
  def: Definition,
  ids: { triggerId: string; ifId: string; aId: string; bId: string; sharedId: string },
): void {
  expect(def.nodes).toHaveLength(5);
  expect(def.edges).toHaveLength(5);
  const find = (from: string, to: string) =>
    def.edges.filter((e) => e.from === from && e.to === to);
  expect(find(ids.triggerId, ids.ifId)).toHaveLength(1);
  const trueEdge = find(ids.ifId, ids.aId);
  expect(trueEdge).toHaveLength(1);
  expect(trueEdge[0]!.label).toBe("true");
  const falseEdge = find(ids.ifId, ids.bId);
  expect(falseEdge).toHaveLength(1);
  expect(falseEdge[0]!.label).toBe("false");
  // BOTH rejoin edges into the shared node survived (unlabeled).
  expect(find(ids.aId, ids.sharedId)).toHaveLength(1);
  expect(find(ids.aId, ids.sharedId)[0]!.label).toBeUndefined();
  expect(find(ids.bId, ids.sharedId)).toHaveLength(1);
  expect(find(ids.bId, ids.sharedId)[0]!.label).toBeUndefined();
  const incomingShared = def.edges.filter((e) => e.to === ids.sharedId);
  expect(incomingShared).toHaveLength(2);
}

async function runNow(
  page: Page,
  workflowId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const resp = await page.request.post(`/api/workflows/${workflowId}/run-now`, {
    headers: { "content-type": "application/json" },
    data: payload,
  });
  expect(resp.status(), await resp.text()).toBe(202);
}

interface RunStep {
  nodeId: string;
  status: string;
  output?: Record<string, unknown>;
}

/**
 * Poll workflow_runs for `expectedCount` TERMINAL rows (durable-queue model:
 * rows exist as 'queued' before execution), return run #expectedCount by
 * started_at order.
 */
async function pollRun(
  userId: string,
  expectedCount: number,
): Promise<{ status: string; steps: RunStep[] }> {
  const rows = await waitFor(
    async () => {
      const r = await getWorkflowRunsForUser(userId);
      const terminal = r.filter((row) => {
        const status = (row as { status?: string }).status;
        return status !== "queued" && status !== "running";
      });
      return terminal.length >= expectedCount ? terminal : null;
    },
    {
      description: `terminal workflow_runs (${expectedCount}) for reconvergence spec`,
      timeoutMs: 30_000,
    },
  );
  const sorted = [...rows].sort((a, b) =>
    String((a as { started_at?: string }).started_at ?? "").localeCompare(
      String((b as { started_at?: string }).started_at ?? ""),
    ),
  );
  return sorted[expectedCount - 1] as unknown as { status: string; steps: RunStep[] };
}

// ── shared journey helpers (same local idiom as the sibling specs) ─────────

async function createWorkflow(page: Page, name: string): Promise<string> {
  await page.goto("/workflows");
  // Fresh accounts get the getting-started checklist overlay (5.ONBOARD-1) —
  // dismiss it so clicks land.
  const dismiss = page.getByTestId("onboarding-dismiss");
  if (await dismiss.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dismiss.click();
    await expect(page.getByTestId("onboarding-checklist")).toBeHidden();
  }
  // Toolbar + empty state both render "Create workflow" — scope to the toolbar.
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
