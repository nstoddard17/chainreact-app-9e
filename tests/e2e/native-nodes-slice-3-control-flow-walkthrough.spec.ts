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
 * Native-nodes Slice 3 — e2e walkthrough for the Tier C control-flow
 * actions (docs/slices/parity/native-nodes-3-tier-c-control-flow-plan.md
 * §10).
 *
 * Proves both Tier C handlers shipped in Slice 3 Commits 2 + 3 thread
 * through the dev server's workflow engine end-to-end, consuming the
 * Engine Branching primitives (`WorkflowEdge.label?`,
 * `ActionHandlerResult.branchTaken?`, `selectActivatedEdges`,
 * `status: "skipped"`):
 *
 *   A. **if_then_condition — true branch selected.** Manual trigger with
 *      payload `{ inputs: { status: "active" } }`. The if_then node's
 *      `input` resolves from `{{trigger.payload.inputs.status}}`; the
 *      `"equals"` operator matches `"active"`; handler emits
 *      `branchTaken: "true"`. The `"true"` labeled edge activates a
 *      downstream `format_transformer` that resolves
 *      `{{if-then.conditionMet}}` to `true`. The `"false"` labeled edge
 *      target is skipped (no handler call). An unlabeled cleanup edge
 *      always runs.
 *
 *   B. **if_then_condition — false branch with `onFalse: "skip"`.** Same
 *      shape but payload sets `status: "inactive"` and the if_then node
 *      sets `onFalse: "skip"`. Only the `"true"` labeled edge is wired
 *      plus an unlabeled cleanup. Asserts the run succeeds (no
 *      INVALID_BRANCH despite no `"false"` edge), `branchTaken: null`
 *      manifest as the `"true"` target being skipped, and the cleanup
 *      ran. This proves the author-facing rule: "if you wire only a
 *      `true` edge, set `onFalse: skip`".
 *
 *   C. **router — first-match-wins.** Router has three named routes
 *      (`vip`, `premium`, `standard`) plus a configured `defaultRoute:
 *      "other"`. Payload sets `tier: "premium"`. Asserts the second
 *      route fires (`evaluatedCount === 2`), the matching branch's
 *      downstream `format_transformer` resolves `{{router.routeLabel}}`
 *      to `"premium"`, and the other three labeled branches
 *      (`vip` / `standard` / `other`) all show `status: "skipped"`.
 *
 *   D. **router — no match falls through to `defaultRoute`.** Same
 *      shape but payload sets `tier: "enterprise"` so nothing matches.
 *      Asserts the `defaultRoute` branch (`other`) fires,
 *      `output.matched: false`, `output.routeLabel: "other"`,
 *      `output.evaluatedCount: 3` (all routes exhausted), and the
 *      three named routes' targets are skipped.
 *
 * Test discipline (carries from Slices 1 + 2):
 *   - One test user per scenario; created in `beforeEach` and torn down
 *     in `afterEach` (the workflow + workflow_runs cascade-delete via
 *     RLS / FK).
 *   - No external network. Both handlers are deterministic pure
 *     functions; downstream proof uses `native:format_transformer`
 *     (pure string → string) rather than an HTTP echo, so no spec-
 *     owned localhost server is needed this slice.
 *   - Workflow creation mirrors Slice 2: UI "Create workflow" button
 *     → PATCH the draftDefinition → click "Activate" → POST `/run-now`.
 *     The PATCH is what lays down the labeled edges that the engine
 *     branching slice consumes.
 *   - All assertions read from the `workflow_runs.steps` payload via
 *     `getWorkflowRunsForUser` (service-role; same helper Slices 1 + 2
 *     use). Skipped steps appear as
 *     `{ nodeId, status: "skipped" }` with no `output` field — exactly
 *     what the engine emits (services/execution/engine.ts).
 */

let testUser: TestUser | null = null;

test.describe("Native-nodes Slice 3 — Tier C control-flow walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
    // BRANCH-ENT-1 — advanced branching (if_then_condition / router) is now a
    // Pro+ capability enforced at save + execution. This walkthrough certifies
    // ROUTING semantics, not billing, so stamp the throwaway personal account
    // Pro (the entitlement rules have their own dedicated spec:
    // advanced-branching-entitlement.spec.ts).
    const admin = adminClient();
    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("owner_user_id", testUser.id)
      .single<{ id: string }>();
    if (!account) throw new Error("walkthrough: personal account not found");
    const { error } = await admin
      .from("account_billing")
      .update({ plan: "pro", plan_status: "active" })
      .eq("account_id", account.id);
    if (error) throw new Error(`walkthrough: pro-plan stamp failed: ${error.message}`);
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  // ── A. if_then_condition — true branch ──────────────────────────────

  test("if_then_condition: matching condition activates the 'true' edge; 'false' target is skipped; unlabeled cleanup always runs", async ({
    page,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    await signIn(page, user);

    const workflowId = await createWorkflow(page, "E2E native-3 — if_then true");

    const draftDefinition = {
      nodes: [
        triggerNode("trigger-node"),
        {
          id: "if-then",
          kind: "action" as const,
          provider: "native",
          type: "if_then_condition",
          config: {
            input: "{{trigger.payload.inputs.status}}",
            operator: "equals",
            value: "active",
            // onFalse defaults to "branch" — we wire both edges below.
          },
          position: { x: 0, y: 100 },
        },
        formatTransformer(
          "ft-true",
          // Proves the downstream sees ifThen's resolved output via the engine resolver.
          "Matched: conditionMet={{if-then.conditionMet}} operator={{if-then.operator}}",
          { x: 0, y: 200 },
        ),
        formatTransformer(
          "ft-false",
          "Should NOT run — false branch.",
          { x: 200, y: 200 },
        ),
        formatTransformer(
          "ft-cleanup",
          "Always-run cleanup",
          { x: 400, y: 200 },
        ),
      ],
      edges: [
        { id: "e0", from: "trigger-node", to: "if-then" },
        { id: "e-true", from: "if-then", to: "ft-true", label: "true" },
        { id: "e-false", from: "if-then", to: "ft-false", label: "false" },
        { id: "e-cleanup", from: "if-then", to: "ft-cleanup" },
      ],
    };
    await patchDraftDefinition(page, workflowId, draftDefinition);
    await activate(page);

    const runResp = await page.request.post(
      `/api/workflows/${workflowId}/run-now`,
      {
        headers: { "content-type": "application/json" },
        data: { inputs: { status: "active" } },
      },
    );
    expect(runResp.status(), await runResp.text()).toBe(202);

    const run = await pollSingleRun(user.id);
    expect(run.status, JSON.stringify(run, null, 2)).toBe("succeeded");

    const byId = stepsById(run);
    expect(byId.get("trigger-node")!.status).toBe("succeeded");
    expect(byId.get("if-then")!.status).toBe("succeeded");
    expect(byId.get("ft-true")!.status).toBe("succeeded");
    expect(byId.get("ft-false")!.status).toBe("skipped");
    expect(byId.get("ft-cleanup")!.status).toBe("succeeded");

    // if_then output shape — locked at plan §5.6.
    const ifThenOut = byId.get("if-then")!.output as {
      conditionMet: boolean;
      operator: string;
      onFalse: string;
    };
    expect(ifThenOut.conditionMet).toBe(true);
    expect(ifThenOut.operator).toBe("equals");
    expect(ifThenOut.onFalse).toBe("branch");

    // Selected-branch data passing: ft-true.transformedContent resolved
    // `{{if-then.conditionMet}}` to "true" + `{{if-then.operator}}` to
    // "equals".
    const ftTrueOut = byId.get("ft-true")!.output as {
      transformedContent: string;
    };
    expect(ftTrueOut.transformedContent).toContain("conditionMet=true");
    expect(ftTrueOut.transformedContent).toContain("operator=equals");

    // ft-false was skipped → no output property on its step.
    expect(byId.get("ft-false")!.output).toBeUndefined();
  });

  // ── B. if_then_condition — onFalse: "skip" ──────────────────────────

  test("if_then_condition: onFalse='skip' on a non-match yields branchTaken=null; only-'true'-edge is skipped; unlabeled cleanup still runs; no INVALID_BRANCH", async ({
    page,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    await signIn(page, user);

    const workflowId = await createWorkflow(
      page,
      "E2E native-3 — if_then skip",
    );

    const draftDefinition = {
      nodes: [
        triggerNode("trigger-node"),
        {
          id: "if-then",
          kind: "action" as const,
          provider: "native",
          type: "if_then_condition",
          config: {
            input: "{{trigger.payload.inputs.status}}",
            operator: "equals",
            value: "active",
            onFalse: "skip", // ← author-facing rule: only "true" edge wired, so use skip.
          },
          position: { x: 0, y: 100 },
        },
        formatTransformer(
          "ft-true",
          "Should not run — false condition under skip.",
          { x: 0, y: 200 },
        ),
        formatTransformer(
          "ft-cleanup",
          "Cleanup: conditionMet={{if-then.conditionMet}} onFalse={{if-then.onFalse}}",
          { x: 200, y: 200 },
        ),
      ],
      // Intentionally NO "false" labeled edge — proves onFalse: "skip"
      // returns branchTaken: null (no labeled activates) without engine
      // INVALID_BRANCH triggering.
      edges: [
        { id: "e0", from: "trigger-node", to: "if-then" },
        { id: "e-true", from: "if-then", to: "ft-true", label: "true" },
        { id: "e-cleanup", from: "if-then", to: "ft-cleanup" },
      ],
    };
    await patchDraftDefinition(page, workflowId, draftDefinition);
    await activate(page);

    const runResp = await page.request.post(
      `/api/workflows/${workflowId}/run-now`,
      {
        headers: { "content-type": "application/json" },
        data: { inputs: { status: "inactive" } },
      },
    );
    expect(runResp.status(), await runResp.text()).toBe(202);

    const run = await pollSingleRun(user.id);
    // Run MUST succeed — onFalse:"skip" + missing "false" edge MUST NOT
    // produce INVALID_BRANCH (engine treats branchTaken:null as the
    // intentional "skip all labeled" signal).
    expect(run.status, JSON.stringify(run, null, 2)).toBe("succeeded");

    const byId = stepsById(run);
    expect(byId.get("trigger-node")!.status).toBe("succeeded");
    expect(byId.get("if-then")!.status).toBe("succeeded");
    expect(byId.get("ft-true")!.status).toBe("skipped");
    expect(byId.get("ft-cleanup")!.status).toBe("succeeded");

    const ifThenOut = byId.get("if-then")!.output as {
      conditionMet: boolean;
      operator: string;
      onFalse: string;
    };
    expect(ifThenOut.conditionMet).toBe(false);
    expect(ifThenOut.onFalse).toBe("skip");

    // Cleanup branch received the resolved if_then output.
    const cleanupOut = byId.get("ft-cleanup")!.output as {
      transformedContent: string;
    };
    expect(cleanupOut.transformedContent).toContain("conditionMet=false");
    expect(cleanupOut.transformedContent).toContain("onFalse=skip");

    // Belt-and-suspenders: no failure classification recorded on the run.
    expect(run.error_classification).toBeNull();
  });

  // ── C. router — first-match-wins ────────────────────────────────────

  test("router: first-match-wins activates only the matching route; other named routes are skipped; downstream resolves {{router.routeLabel}}", async ({
    page,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    await signIn(page, user);

    const workflowId = await createWorkflow(
      page,
      "E2E native-3 — router match",
    );

    const draftDefinition = {
      nodes: [
        triggerNode("trigger-node"),
        {
          id: "router",
          kind: "action" as const,
          provider: "native",
          type: "router",
          config: {
            routes: [
              {
                label: "vip",
                condition: {
                  input: "{{trigger.payload.inputs.tier}}",
                  operator: "equals",
                  value: "vip",
                },
              },
              {
                label: "premium",
                condition: {
                  input: "{{trigger.payload.inputs.tier}}",
                  operator: "equals",
                  value: "premium",
                },
              },
              {
                label: "standard",
                condition: {
                  input: "{{trigger.payload.inputs.tier}}",
                  operator: "equals",
                  value: "standard",
                },
              },
            ],
            defaultRoute: "other",
          },
          position: { x: 0, y: 100 },
        },
        formatTransformer(
          "ft-vip",
          "vip branch",
          { x: -300, y: 200 },
        ),
        formatTransformer(
          "ft-premium",
          "Premium! routeLabel={{router.routeLabel}} matched={{router.matched}} evaluatedCount={{router.evaluatedCount}}",
          { x: -100, y: 200 },
        ),
        formatTransformer(
          "ft-standard",
          "standard branch",
          { x: 100, y: 200 },
        ),
        formatTransformer(
          "ft-other",
          "fallback branch",
          { x: 300, y: 200 },
        ),
      ],
      edges: [
        { id: "e0", from: "trigger-node", to: "router" },
        { id: "e-vip", from: "router", to: "ft-vip", label: "vip" },
        { id: "e-premium", from: "router", to: "ft-premium", label: "premium" },
        { id: "e-standard", from: "router", to: "ft-standard", label: "standard" },
        { id: "e-other", from: "router", to: "ft-other", label: "other" },
      ],
    };
    await patchDraftDefinition(page, workflowId, draftDefinition);
    await activate(page);

    const runResp = await page.request.post(
      `/api/workflows/${workflowId}/run-now`,
      {
        headers: { "content-type": "application/json" },
        data: { inputs: { tier: "premium" } },
      },
    );
    expect(runResp.status(), await runResp.text()).toBe(202);

    const run = await pollSingleRun(user.id);
    expect(run.status, JSON.stringify(run, null, 2)).toBe("succeeded");

    const byId = stepsById(run);
    expect(byId.get("trigger-node")!.status).toBe("succeeded");
    expect(byId.get("router")!.status).toBe("succeeded");
    expect(byId.get("ft-premium")!.status).toBe("succeeded");
    // The other three named-route targets are skipped (no handler call).
    expect(byId.get("ft-vip")!.status).toBe("skipped");
    expect(byId.get("ft-standard")!.status).toBe("skipped");
    expect(byId.get("ft-other")!.status).toBe("skipped");

    const routerOut = byId.get("router")!.output as {
      matched: boolean;
      routeLabel: string | null;
      evaluatedCount: number;
    };
    expect(routerOut.matched).toBe(true);
    expect(routerOut.routeLabel).toBe("premium");
    // First-match-wins: vip (no) → premium (YES) ⇒ stopped at position 2.
    expect(routerOut.evaluatedCount).toBe(2);

    // Selected-branch data passing: ft-premium.transformedContent threaded
    // {{router.routeLabel}} + matched + evaluatedCount.
    const premiumOut = byId.get("ft-premium")!.output as {
      transformedContent: string;
    };
    expect(premiumOut.transformedContent).toContain("routeLabel=premium");
    expect(premiumOut.transformedContent).toContain("matched=true");
    expect(premiumOut.transformedContent).toContain("evaluatedCount=2");

    // Skipped branches have no output.
    expect(byId.get("ft-vip")!.output).toBeUndefined();
    expect(byId.get("ft-standard")!.output).toBeUndefined();
    expect(byId.get("ft-other")!.output).toBeUndefined();
  });

  // ── D. router — no match falls through to defaultRoute ──────────────

  test("router: no match falls through to defaultRoute; only the default branch runs", async ({
    page,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    await signIn(page, user);

    const workflowId = await createWorkflow(
      page,
      "E2E native-3 — router default",
    );

    const draftDefinition = {
      nodes: [
        triggerNode("trigger-node"),
        {
          id: "router",
          kind: "action" as const,
          provider: "native",
          type: "router",
          config: {
            routes: [
              {
                label: "vip",
                condition: {
                  input: "{{trigger.payload.inputs.tier}}",
                  operator: "equals",
                  value: "vip",
                },
              },
              {
                label: "premium",
                condition: {
                  input: "{{trigger.payload.inputs.tier}}",
                  operator: "equals",
                  value: "premium",
                },
              },
              {
                label: "standard",
                condition: {
                  input: "{{trigger.payload.inputs.tier}}",
                  operator: "equals",
                  value: "standard",
                },
              },
            ],
            defaultRoute: "other",
          },
          position: { x: 0, y: 100 },
        },
        formatTransformer("ft-vip", "vip branch", { x: -300, y: 200 }),
        formatTransformer("ft-premium", "premium branch", { x: -100, y: 200 }),
        formatTransformer("ft-standard", "standard branch", { x: 100, y: 200 }),
        formatTransformer(
          "ft-other",
          "Default! routeLabel={{router.routeLabel}} matched={{router.matched}} evaluatedCount={{router.evaluatedCount}}",
          { x: 300, y: 200 },
        ),
      ],
      edges: [
        { id: "e0", from: "trigger-node", to: "router" },
        { id: "e-vip", from: "router", to: "ft-vip", label: "vip" },
        { id: "e-premium", from: "router", to: "ft-premium", label: "premium" },
        { id: "e-standard", from: "router", to: "ft-standard", label: "standard" },
        { id: "e-other", from: "router", to: "ft-other", label: "other" },
      ],
    };
    await patchDraftDefinition(page, workflowId, draftDefinition);
    await activate(page);

    const runResp = await page.request.post(
      `/api/workflows/${workflowId}/run-now`,
      {
        headers: { "content-type": "application/json" },
        data: { inputs: { tier: "enterprise" } },
      },
    );
    expect(runResp.status(), await runResp.text()).toBe(202);

    const run = await pollSingleRun(user.id);
    expect(run.status, JSON.stringify(run, null, 2)).toBe("succeeded");

    const byId = stepsById(run);
    expect(byId.get("trigger-node")!.status).toBe("succeeded");
    expect(byId.get("router")!.status).toBe("succeeded");
    // Default branch runs.
    expect(byId.get("ft-other")!.status).toBe("succeeded");
    // The three named-route branches are all skipped.
    expect(byId.get("ft-vip")!.status).toBe("skipped");
    expect(byId.get("ft-premium")!.status).toBe("skipped");
    expect(byId.get("ft-standard")!.status).toBe("skipped");

    const routerOut = byId.get("router")!.output as {
      matched: boolean;
      routeLabel: string | null;
      evaluatedCount: number;
    };
    expect(routerOut.matched).toBe(false);
    expect(routerOut.routeLabel).toBe("other");
    // All three routes evaluated without a match → evaluatedCount === 3.
    expect(routerOut.evaluatedCount).toBe(3);

    const otherOut = byId.get("ft-other")!.output as {
      transformedContent: string;
    };
    expect(otherOut.transformedContent).toContain("routeLabel=other");
    expect(otherOut.transformedContent).toContain("matched=false");
    expect(otherOut.transformedContent).toContain("evaluatedCount=3");
  });
});

// ── helpers ──────────────────────────────────────────────────────────────

// The project enforces CAPTCHA on password sign-in (no local Turnstile key),
// so tests authenticate through the app's own /auth/callback with a
// service-role-minted email link — an ordinary session, no bypass.
async function signIn(page: Page, user: TestUser): Promise<void> {
  await signInViaEmailLink(page, user);
}

/**
 * Creates a workflow via the UI Create-button flow, returns the new
 * workflow id parsed from the URL. Mirrors the Slice 2 walkthrough's
 * setup — V2's builder doesn't have per-node config UI yet, so the
 * test PATCHes the full draftDefinition immediately after.
 */
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

/**
 * Poll workflow_runs for exactly one TERMINAL row; return it. Since
 * DURABLE-QUEUE-1 the row exists as 'queued' before execution (run-now
 * enqueues durably, then drains), so waiting for mere row EXISTENCE races the
 * drain — wait until the status leaves queued/running.
 */
async function pollSingleRun(
  userId: string,
): Promise<Record<string, unknown>> {
  const rows = await waitFor(
    async () => {
      const r = await getWorkflowRunsForUser(userId);
      const terminal = r.filter((row) => {
        const status = (row as { status?: string }).status;
        return status !== "queued" && status !== "running";
      });
      return terminal.length > 0 ? terminal : null;
    },
    {
      description: "terminal workflow_runs row for slice-3 walkthrough",
      timeoutMs: 20_000,
    },
  );
  expect(rows).toHaveLength(1);
  return rows[0]! as Record<string, unknown>;
}

interface RunStep {
  nodeId: string;
  status: string;
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
}

function stepsById(run: Record<string, unknown>): Map<string, RunStep> {
  const steps = run.steps as RunStep[];
  return new Map(steps.map((s) => [s.nodeId, s]));
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
    config: {
      content,
      sourceFormat: "plain",
      targetFormat: "plain",
    },
    position,
  };
}
