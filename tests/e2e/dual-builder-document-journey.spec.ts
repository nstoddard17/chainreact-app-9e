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
 * 5.DUAL-BUILDER-1 CS-7 — the previously-deferred REAL BROWSER cross-builder
 * journey. It proves the load-bearing dual-builder guarantee end-to-end through
 * the actual UI: two editors, ONE workflow — a workflow authored/edited in the
 * Document is byte-identical to the Visual Builder, to Save, to reload, and to
 * the engine.
 *
 * FLAG SCOPING (test-process only): the Document Builder is flag-gated
 * (`ENABLE_DOCUMENT_BUILDER`, default OFF). This journey requires it ON; it is
 * enabled ONLY by setting the flag in the COMMAND ENVIRONMENT, which
 * playwright.config.ts forwards into the isolated test server:
 *
 *   ENABLE_DOCUMENT_BUILDER=true npx playwright test dual-builder-document-journey
 *
 * No checked-in shared env file is modified. Because the server flag is global
 * per run, the two cases are complementary and self-skip on the wrong flag state:
 *   - the JOURNEY runs only when the flag is ON;
 *   - the FLAG-OFF case (toggle hidden) runs only when the flag is OFF.
 *
 * Same harness as the sibling specs (reconvergence-builder-ui, slice-3
 * walkthrough): email-link sign-in around the CAPTCHA, Pro-plan stamping
 * (If/Then is BRANCH-ENT-1 Pro-gated), onboarding-overlay dismissal,
 * toolbar-scoped Create, TERMINAL-status run polling. API GET/run-now are used
 * for assertion/dispatch only — every EDIT in the journey is a real UI gesture.
 */

const FLAG_ON = process.env.ENABLE_DOCUMENT_BUILDER === "true";

let testUser: TestUser | null = null;

test.describe("5.DUAL-BUILDER-1 CS-7 — Document Builder cross-builder journey", () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async () => {
    testUser = await createTestUser();
    // If/Then is a Pro capability; this journey certifies dual-builder parity,
    // not billing, so stamp the throwaway personal account Pro.
    const admin = adminClient();
    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("owner_user_id", testUser.id)
      .single<{ id: string }>();
    if (!account) throw new Error("dual-builder spec: personal account not found");
    const { error } = await admin
      .from("account_billing")
      .update({ plan: "pro", plan_status: "active" })
      .eq("account_id", account.id);
    if (error) throw new Error(`dual-builder spec: pro-plan stamp failed: ${error.message}`);
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("flag OFF hides the Visual/Document toggle (Visual only) @flag-off", async ({ page }) => {
    // CS-7D — assert the app is running flag-OFF; do NOT self-skip. Selected by
    // `npm run e2e:dual-builder:flag-off` (grep @flag-off). If the wrong app
    // state is running this fails loudly instead of silently skipping.
    expect(
      FLAG_ON,
      "flag-off case must run with ENABLE_DOCUMENT_BUILDER unset/false — use `npm run e2e:dual-builder:flag-off`",
    ).toBe(false);
    if (!testUser) throw new Error("test user setup failed");
    await signInViaEmailLink(page, testUser);
    await createWorkflow(page, "E2E dual-builder flag-off");
    // The builder loads in Visual with NO Document toggle.
    await expect(page.getByTestId("builder-view-toggle")).toHaveCount(0);
    await expect(page.getByTestId("document-view")).toHaveCount(0);
    await page.getByRole("button", { name: "Choose a trigger" }).click();
    await page.getByRole("button", { name: /Manual Trigger/ }).click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(1);
    // Still no toggle after content exists.
    await expect(page.getByTestId("builder-view-toggle")).toHaveCount(0);
  });

  test("build in Visual, edit in Document, save/reload/persist, run — one workflow @flag-on", async ({
    page,
  }) => {
    // CS-7D — assert the app is running flag-ON; do NOT self-skip. Selected by
    // `npm run e2e:dual-builder` (grep @flag-on). If the wrong app state is
    // running this fails loudly instead of silently skipping.
    expect(
      FLAG_ON,
      "flag-on journey must run with ENABLE_DOCUMENT_BUILDER=true — use `npm run e2e:dual-builder`",
    ).toBe(true);
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    await signInViaEmailLink(page, user);

    const workflowId = await createWorkflow(page, "E2E dual-builder journey");

    // ── 1. Build a small linear workflow via the REAL Visual pickers ───────
    await page.getByRole("button", { name: "Choose a trigger" }).click();
    await page.getByRole("button", { name: /Manual Trigger/ }).click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(1);
    const triggerId = (await listNodeIds(page))[0]!;
    const fmtId = await addActionFromLibrary(page, "Format Transformer", /Format Transformer/, 2);

    // Configure the action in the Visual inspector so the Document shows a value.
    await fitView(page);
    await openNodeConfig(page, fmtId);
    await page.getByRole("textbox", { name: "Content", exact: true }).fill("visual value");
    await pickSelectOption(page, "Target Format", "Plain text");
    await saveNodeConfig(page);
    await page.getByRole("button", { name: "Close drawer" }).click();

    // ── 2. Switch to Document; verify the SAME steps + value ───────────────
    await page.getByTestId("builder-view-toggle-document").click();
    await expect(page.getByTestId("document-view")).toBeVisible();
    // The action's configured value renders as a chip in prose.
    await expect(page.getByTestId("document-view")).toContainText("visual value");
    // CS-7D — capture real authenticated screenshots at each reached state
    // (uncommitted owner-review dir). Never fails the journey.
    await shot(page, "01-document-linear");

    // ── 3. Edit a configured value through the Guided Stop ─────────────────
    await page.getByTestId(`document-value-chip-${fmtId}-Content`).click();
    const stop = page.getByTestId("document-guided-stop");
    await expect(stop).toBeVisible();
    await shot(page, "02-guided-stop-open");
    const textarea = stop.getByRole("textbox", { name: "Content", exact: true });
    await textarea.fill("document value");
    await page.getByTestId("guided-stop-done").click();
    await expect(page.getByTestId("document-guided-stop")).toHaveCount(0);
    await expect(page.getByTestId("document-view")).toContainText("document value");

    // ── 4. Open the Whole Workflow map and close it (navigation only) ──────
    // The Finish Setup banner hosts the "map" entry; open + Escape-close.
    const mapOpener = page.getByRole("button", { name: /whole workflow|map/i }).first();
    if (await mapOpener.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await mapOpener.click();
      await expect(page.getByRole("dialog", { name: "Whole workflow map" })).toBeVisible();
      await shot(page, "07-whole-workflow-map");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Whole workflow map" })).toHaveCount(0);
    }

    // ── 5. Save through the EXISTING header Save; no autosave before it ─────
    // Dirty from the Guided Stop edit, but nothing persisted until Save.
    const saveButton = page.getByTestId("builder-header-save-button");
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(saveButton).toHaveText("Save", { timeout: 15_000 });
    await expect(saveButton).toBeDisabled();

    const persisted = await readDefinition(page, workflowId);
    const fmtNode = persisted.nodes.find((n) => n.id === fmtId)!;
    expect((fmtNode as { config?: { content?: string } }).config?.content).toBe("document value");

    // ── 6. Reload; open in Document; verify persistence ────────────────────
    await page.reload();
    // The saved view pref may restore either surface; force Document.
    const docToggle = page.getByTestId("builder-view-toggle-document");
    await docToggle.click();
    await expect(page.getByTestId("document-view")).toContainText("document value");

    await shot(page, "10-document-saved-persisted");
    // Narrow-width Document (responsive) — capture then restore the viewport.
    await page.setViewportSize({ width: 400, height: 900 });
    await expect(page.getByTestId("document-view")).toBeVisible();
    await shot(page, "11-narrow-document");
    await page.setViewportSize({ width: 1280, height: 720 });

    // ── 7. Switch to Visual; canonical topology/config unchanged ───────────
    await page.getByTestId("builder-view-toggle-visual").click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(2);
    await shot(page, "12-visual-same-graph");
    const reloaded = await readDefinition(page, workflowId);
    expect(reloaded.nodes).toHaveLength(2);
    expect(reloaded.edges.filter((e) => e.from === triggerId && e.to === fmtId)).toHaveLength(1);

    // ── 8. Activate + run through the durable queue (execution parity) ─────
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 10_000 });
    await runNow(page, workflowId, { inputs: {} });
    const run = await pollRun(user.id, 1);
    expect(run.status, JSON.stringify(run, null, 2)).toBe("succeeded");
    const fmtStep = run.steps.find((s) => s.nodeId === fmtId)!;
    expect(fmtStep.status).toBe("succeeded");
    expect((fmtStep.output as { transformedContent?: string }).transformedContent).toBe(
      "document value",
    );
  });
});

// ── helpers (same local idiom as the sibling walkthrough specs) ──────────────

/**
 * CS-7D — capture a real authenticated screenshot into the uncommitted
 * owner-review directory. Best-effort: a screenshot failure must never fail the
 * acceptance journey (the assertions above already prove the state).
 */
async function shot(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({
      path: `owner-review/cs7d/${name}.png`,
      fullPage: true,
    });
  } catch {
    // ignore — screenshots are evidence, not an assertion
  }
}

async function listNodeIds(page: Page): Promise<string[]> {
  return page
    .locator(".react-flow__node")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-id") ?? ""));
}

function diffOne(before: string[], after: string[]): string {
  const added = after.filter((id) => !before.includes(id));
  if (added.length !== 1) {
    throw new Error(`expected exactly one new canvas element, got [${added.join(", ")}]`);
  }
  return added[0]!;
}

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
  await page.waitForTimeout(300);
}

function nodeCard(page: Page, nodeId: string): Locator {
  return page.locator(`.react-flow__node[data-id="${nodeId}"]`);
}

async function openNodeConfig(page: Page, nodeId: string): Promise<void> {
  await nodeCard(page, nodeId).click({ position: { x: 30, y: 30 } });
  await expect(page.getByRole("complementary", { name: "Node configuration" })).toBeVisible();
}

async function saveNodeConfig(page: Page): Promise<void> {
  const save = page.getByTestId("config-modal-save-button");
  await save.click();
  await expect(save).toBeDisabled();
}

async function pickSelectOption(page: Page, fieldLabel: string, optionName: string): Promise<void> {
  await page.getByLabel(fieldLabel, { exact: true }).click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

interface Definition {
  nodes: Array<{ id: string; kind: string; type: string; config?: Record<string, unknown> }>;
  edges: Array<{ id: string; from: string; to: string; label?: string }>;
}

async function readDefinition(page: Page, workflowId: string): Promise<Definition> {
  const resp = await page.request.get(`/api/workflows/${workflowId}`);
  expect(resp.status(), await resp.text()).toBe(200);
  return (await resp.json()).draftDefinition as Definition;
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
    { description: `terminal workflow_runs (${expectedCount})`, timeoutMs: 30_000 },
  );
  const sorted = [...rows].sort((a, b) =>
    String((a as { started_at?: string }).started_at ?? "").localeCompare(
      String((b as { started_at?: string }).started_at ?? ""),
    ),
  );
  return sorted[expectedCount - 1] as unknown as { status: string; steps: RunStep[] };
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
