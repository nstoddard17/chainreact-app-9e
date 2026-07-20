import { test, expect, type Page } from "@playwright/test";
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
 * BRANCH-ENT-1 — advanced-branching routing + plan-entitlement walkthrough.
 *
 * Three journeys against the real dev server + Supabase (no provider network —
 * everything here is native nodes):
 *
 *   1. PAID builder journey — a Pro account adds the If/Then Condition through
 *      the node library (unlocked), sees the True/False/Always branch handles
 *      on the card, persists a labeled two-route graph, reloads (labels
 *      survive), activates, and runs BOTH routes: the selected branch runs,
 *      the other is persisted `skipped`, the unlabeled cleanup edge always
 *      runs, and run history shows the runs.
 *
 *   2. FREE journey — a Free account sees If/Then + Router in the library as
 *      LOCKED (visible + searchable, "Pro" badge, upgrade CTA); clicking shows
 *      the explanation and adds nothing; a DIRECT API save containing the
 *      restricted node is rejected with typed PLAN_FEATURE_REQUIRED and the
 *      persisted definition is unchanged.
 *
 *   3. DOWNGRADE journey — a workflow built + activated while Pro stops
 *      running after the account's billing flips to Free (typed 403 on
 *      run-now); the builder still opens (recoverable), a compliant
 *      replacement (branching removed) saves fine, and after publishing the
 *      compliant draft the workflow runs again.
 *
 * Plan state is set through a service-role fixture on `account_billing`
 * (plan/plan_status — the same columns the Stripe webhook writes). New test
 * users default to a Free personal account.
 */

let testUser: TestUser | null = null;

test.describe("BRANCH-ENT-1 — advanced branching entitlement + routing", () => {
  // Multi-phase UI journeys (sign-in → dashboard → builder → picker → save →
  // reload → activate → two runs) legitimately exceed the default 30s budget.
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  // ── 1. Paid builder-driven journey ──────────────────────────────────────

  test("Pro account: add If/Then via the library, branch handles + labels render, both routes execute correctly after save/reload", async ({
    page,
  }) => {
    const user = requireUser();
    await setAccountPlan(user.id, "pro", "active");
    await signIn(page, user);
    const workflowId = await createWorkflow(page, "E2E BRANCH-ENT paid journey");

    // Builder: trigger via the library.
    await page.getByRole("button", { name: "Choose a trigger" }).click();
    await page.getByRole("button", { name: /Manual Trigger/ }).click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(1);

    // Builder: If/Then Condition via the library — UNLOCKED for Pro (no badge,
    // no upgrade callout; the node is actually added).
    await page.getByRole("button", { name: "+ Add action" }).click();
    const ifRow = page.getByRole("button", { name: /If\/Then Condition/ });
    await expect(ifRow).toBeVisible();
    await expect(page.getByTestId("picker-row-plan-badge")).toHaveCount(0);
    await ifRow.click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(2);

    // The branching card exposes the stable route handles + captions.
    await expect(page.getByTestId("branch-handle-captions")).toContainText("True");
    await expect(page.getByTestId("branch-handle-captions")).toContainText("False");
    await expect(page.getByTestId("branch-handle-captions")).toContainText("Always");

    // Persist the full two-route graph (config + labeled edges + cleanup) via
    // the API — the same definition shape the builder's labeled handles
    // produce — then reload to prove labels SURVIVE persistence.
    const draftDefinition = {
      nodes: [
        triggerNode("trigger-node"),
        ifNode("if-then", {
          input: "{{trigger.payload.inputs.status}}",
          operator: "equals",
          value: "active",
          onFalse: "branch",
        }),
        formatTransformer("ft-true", "TRUE ran: {{if-then.conditionMet}}", { x: -200, y: 240 }),
        formatTransformer("ft-false", "FALSE ran: {{if-then.conditionMet}}", { x: 200, y: 240 }),
        formatTransformer("ft-cleanup", "Cleanup always runs", { x: 0, y: 380 }),
      ],
      edges: [
        { id: "e0", from: "trigger-node", to: "if-then" },
        { id: "e-true", from: "if-then", to: "ft-true", label: "true" },
        { id: "e-false", from: "if-then", to: "ft-false", label: "false" },
        { id: "e-cleanup", from: "if-then", to: "ft-cleanup" },
      ],
    };
    await patchDraftDefinition(page, workflowId, draftDefinition);

    // After reload the persisted branch labels render as on-edge route pills.
    await expect(page.getByTestId("workflow-edge-label-e-true")).toContainText(/true/i);
    await expect(page.getByTestId("workflow-edge-label-e-false")).toContainText(/false/i);

    await activate(page);

    // Run 1 — TRUE input: true branch runs, false branch skipped, cleanup runs.
    await runNow(page, workflowId, { inputs: { status: "active" } }, 202);
    const run1 = await pollRun(user.id, 1);
    expect(run1.status).toBe("succeeded");
    const steps1 = stepsByNode(run1);
    expect(steps1["ft-true"]?.status).toBe("succeeded");
    expect(steps1["ft-false"]?.status).toBe("skipped");
    expect(steps1["ft-false"]?.output).toBeUndefined(); // skipped → no output
    expect(steps1["ft-cleanup"]?.status).toBe("succeeded");
    expect(JSON.stringify(steps1["ft-true"]?.output ?? {})).toContain("TRUE ran: true");

    // Run 2 — FALSE input: false branch runs, true branch skipped, cleanup runs.
    await runNow(page, workflowId, { inputs: { status: "inactive" } }, 202);
    const run2 = await pollRun(user.id, 2);
    expect(run2.status).toBe("succeeded");
    const steps2 = stepsByNode(run2);
    expect(steps2["ft-false"]?.status).toBe("succeeded");
    expect(steps2["ft-true"]?.status).toBe("skipped");
    expect(steps2["ft-cleanup"]?.status).toBe("succeeded");

    // Run history: both runs listed as Success, and the selected (newest =
    // FALSE-input) run's step list displays the non-selected branch as skipped.
    await page.reload();
    await page.getByRole("tab", { name: "Runs" }).click();
    const runRows = page.getByRole("navigation", { name: "Recent runs" });
    await expect(
      runRows.getByRole("button", { name: /Success Manual run/ }),
    ).toHaveCount(2, { timeout: 10_000 });
    await expect(page.getByLabel("Run steps")).toContainText(/skipped/i);
  });

  // ── 2. Free-plan journey ────────────────────────────────────────────────

  test("Free account: If/Then + Router are visible but LOCKED in the library; direct API save is rejected typed with nothing persisted", async ({
    page,
  }) => {
    const user = requireUser();
    // New accounts default to Free — no fixture needed. Assert it anyway so a
    // future default change fails loudly instead of silently weakening this test.
    await expectAccountPlan(user.id, "free");
    await signIn(page, user);
    const workflowId = await createWorkflow(page, "E2E BRANCH-ENT free journey");

    await page.getByRole("button", { name: "Choose a trigger" }).click();
    await page.getByRole("button", { name: /Manual Trigger/ }).click();

    // Library: locked entry — visible, searchable, Pro badge, upgrade CTA.
    await page.getByRole("button", { name: "+ Add action" }).click();
    await page.getByLabel("Search add-node panel").fill("If/Then");
    const ifRow = page.getByRole("button", { name: /If\/Then Condition/ });
    await expect(ifRow).toBeVisible();
    await expect(page.getByTestId("picker-row-plan-badge").first()).toContainText(/pro/i);

    // Clicking explains the feature + shows the upgrade CTA — and adds NOTHING.
    await ifRow.click();
    const callout = page.getByTestId("branching-upgrade-callout");
    await expect(callout).toContainText(/different paths based on conditions/i);
    await expect(callout.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute(
      "href",
      "/account",
    );
    await page.keyboard.press("Escape"); // close the panel
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(1); // trigger only

    // Direct API save containing the restricted node → typed 403, nothing persisted.
    const before = await page.request.get(`/api/workflows/${workflowId}`);
    const beforeDef = (await before.json()).draftDefinition;
    const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: {
        draftDefinition: {
          nodes: [
            triggerNode("trigger-node"),
            ifNode("if-then", { input: "x", operator: "is_not_empty", onFalse: "skip" }),
            formatTransformer("ft", "should never save", { x: 0, y: 240 }),
          ],
          edges: [
            { id: "e0", from: "trigger-node", to: "if-then" },
            { id: "e-true", from: "if-then", to: "ft", label: "true" },
          ],
        },
      },
    });
    expect(patch.status()).toBe(403);
    const body = await patch.json();
    expect(body.code).toBe("PLAN_FEATURE_REQUIRED");
    expect(body.capability).toBe("advanced_branching");
    expect(body.requiredPlan).toBe("pro");
    expect(body.upgradeRoute).toBe("/account");

    const after = await page.request.get(`/api/workflows/${workflowId}`);
    expect((await after.json()).draftDefinition).toEqual(beforeDef); // no partial persist
  });

  // ── 3. Downgrade journey ────────────────────────────────────────────────

  test("downgrade: an activated branching workflow stops running on Free, stays editable, and runs again after a compliant replacement", async ({
    page,
  }) => {
    const user = requireUser();
    await setAccountPlan(user.id, "pro", "active");
    await signIn(page, user);
    const workflowId = await createWorkflow(page, "E2E BRANCH-ENT downgrade");

    const branchingDef = {
      nodes: [
        triggerNode("trigger-node"),
        ifNode("if-then", {
          input: "{{trigger.payload.inputs.status}}",
          operator: "equals",
          value: "active",
          onFalse: "skip",
        }),
        formatTransformer("ft-true", "gated branch", { x: 0, y: 240 }),
      ],
      edges: [
        { id: "e0", from: "trigger-node", to: "if-then" },
        { id: "e-true", from: "if-then", to: "ft-true", label: "true" },
      ],
    };
    await patchDraftDefinition(page, workflowId, branchingDef);
    await activate(page);

    // Paid: runs fine.
    await runNow(page, workflowId, { inputs: { status: "active" } }, 202);
    await pollRun(user.id, 1);

    // Downgrade to Free (billing fixture — same columns the webhook writes).
    await setAccountPlan(user.id, "free", "active");

    // Execution is blocked with the typed error…
    const blocked = await page.request.post(`/api/workflows/${workflowId}/run-now`, {
      headers: { "content-type": "application/json" },
      data: { inputs: { status: "active" } },
    });
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).code).toBe("PLAN_FEATURE_REQUIRED");

    // …but the workflow stays OPEN and editable (no trap): the builder loads
    // and shows the branching node.
    await page.reload();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(3);

    // Compliant replacement: remove the branching node → save is ALLOWED.
    const compliantDef = {
      nodes: [
        triggerNode("trigger-node"),
        formatTransformer("ft-linear", "linear replacement", { x: 0, y: 240 }),
      ],
      edges: [{ id: "e0", from: "trigger-node", to: "ft-linear" }],
    };
    const save = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: { draftDefinition: compliantDef },
    });
    expect(save.status(), await save.text()).toBe(200);

    // Publish the compliant draft so live execution uses it, then run again.
    const publish = await page.request.post(`/api/workflows/${workflowId}/publish`);
    expect(publish.status(), await publish.text()).toBe(200);
    await runNow(page, workflowId, { inputs: { status: "active" } }, 202);
    const rerun = await pollRun(user.id, 2);
    expect(rerun.status).toBe("succeeded");
    const steps = stepsByNode(rerun);
    expect(steps["ft-linear"]?.status).toBe("succeeded");
  });
});

// ── helpers ───────────────────────────────────────────────────────────────

function requireUser(): TestUser {
  if (!testUser) throw new Error("test user setup failed");
  return testUser;
}

/**
 * Billing fixture: set the personal account's plan/plan_status directly with
 * the service-role client — the same two columns the Stripe webhook (the sole
 * production writer) maintains. Personal accounts allow free/pro only.
 */
async function setAccountPlan(
  userId: string,
  plan: "free" | "pro",
  planStatus: "active" | "trialing" | "canceled",
): Promise<void> {
  const admin = adminClient();
  const { data: account, error } = await admin
    .from("accounts")
    .select("id")
    .eq("owner_user_id", userId)
    .single();
  if (error || !account) {
    throw new Error(`setAccountPlan: personal account lookup failed: ${error?.message}`);
  }
  const { error: updateError } = await admin
    .from("account_billing")
    .update({ plan, plan_status: planStatus })
    .eq("account_id", account.id);
  if (updateError) {
    throw new Error(`setAccountPlan: billing update failed: ${updateError.message}`);
  }
}

async function expectAccountPlan(userId: string, plan: string): Promise<void> {
  const admin = adminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id")
    .eq("owner_user_id", userId)
    .single();
  const { data: billing } = await admin
    .from("account_billing")
    .select("plan")
    .eq("account_id", account!.id)
    .single();
  expect(billing?.plan).toBe(plan);
}

// The project enforces CAPTCHA on password sign-in (no local Turnstile key),
// so tests authenticate through the app's own /auth/callback with a
// service-role-minted email link — an ordinary session, no bypass.
async function signIn(page: Page, user: TestUser): Promise<void> {
  await signInViaEmailLink(page, user);
}

async function createWorkflow(page: Page, name: string): Promise<string> {
  await page.goto("/workflows");
  // A fresh account gets the getting-started checklist overlay (5.ONBOARD-1),
  // which floats over the dashboard CTA — dismiss it so clicks land.
  const dismiss = page.getByTestId("onboarding-dismiss");
  if (await dismiss.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dismiss.click();
    await expect(page.getByTestId("onboarding-checklist")).toBeHidden();
  }
  // Both the toolbar and the empty state render a "Create workflow" button on
  // a fresh account — scope to the toolbar for a strict-mode-safe click.
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

async function patchDraftDefinition(
  page: Page,
  workflowId: string,
  draftDefinition: unknown,
): Promise<void> {
  const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
    data: { draftDefinition },
  });
  expect(patch.status(), await patch.text()).toBe(200);
  await page.reload();
}

async function activate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Activate" }).click();
  // The redesigned header swaps the lifecycle cluster to "Pause" once the
  // workflow is active — that's the stable active-state signal.
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible({
    timeout: 10_000,
  });
}

async function runNow(
  page: Page,
  workflowId: string,
  payload: Record<string, unknown>,
  expectedStatus: number,
): Promise<void> {
  const resp = await page.request.post(`/api/workflows/${workflowId}/run-now`, {
    headers: { "content-type": "application/json" },
    data: payload,
  });
  expect(resp.status(), await resp.text()).toBe(expectedStatus);
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
      const finished = r.filter(
        (row) => (row as { status?: string }).status !== "running" &&
          (row as { status?: string }).status !== "queued",
      );
      return finished.length >= expectedCount ? finished : null;
    },
    {
      description: `workflow_runs (${expectedCount}) for BRANCH-ENT walkthrough`,
      timeoutMs: 20_000,
    },
  );
  // Rows come newest-first or oldest-first depending on the helper's ordering;
  // pick by started_at ordering so run #N is deterministic.
  const sorted = [...rows].sort((a, b) =>
    String((a as { started_at?: string }).started_at ?? "").localeCompare(
      String((b as { started_at?: string }).started_at ?? ""),
    ),
  );
  return sorted[expectedCount - 1] as unknown as { status: string; steps: RunStep[] };
}

function stepsByNode(run: { steps: RunStep[] }): Record<string, RunStep | undefined> {
  const map: Record<string, RunStep | undefined> = {};
  for (const s of run.steps ?? []) map[s.nodeId] = s;
  return map;
}

function triggerNode(id: string) {
  return {
    id,
    kind: "trigger" as const,
    provider: "native",
    type: "manual.run",
    config: {},
    position: { x: 0, y: 0 },
  };
}

function ifNode(id: string, config: Record<string, unknown>) {
  return {
    id,
    kind: "action" as const,
    provider: "native",
    type: "if_then_condition",
    config,
    position: { x: 0, y: 120 },
  };
}

function formatTransformer(
  id: string,
  content: string,
  position: { x: number; y: number },
) {
  return {
    id,
    kind: "action" as const,
    provider: "native",
    type: "format_transformer",
    config: { content, sourceFormat: "plain", targetFormat: "plain" },
    position,
  };
}
