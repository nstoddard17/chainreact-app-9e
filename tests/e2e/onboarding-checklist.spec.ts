import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createTestUser,
  deleteTestUser,
  getIntegrationsForUser,
  getWorkflowRunsForUser,
  waitFor,
  type TestUser,
} from "./helpers/supabaseAdmin";
import { readMockState } from "./global-setup";

/**
 * 5.ONBOARD-1 Batch 4 — first-workflow onboarding checklist e2e journey.
 *
 * Real surfaces exercised (shared-mock rule: ONLY the Slack network boundary
 * is mocked): auth sign-in UI, the flag-ON checklist on /workflows, the
 * create-chooser → real workflow creation, the /apps?highlight deep link +
 * REAL OAuth dispatcher against the mock Slack, connection-diagnosis-driven
 * step derivation, write-path readiness, a real test-mode run (workflow_runs
 * row), real activation (trigger registration + lifecycle), the completion
 * latch + success state, and persistence across sign-out/sign-in.
 *
 * Bad paths here: reconnect-required regression of the Connect step and the
 * automated-trigger "waiting for first run" honesty. The remaining bad paths
 * (admin-required member copy, latch-failure-never-fails-activation, forged
 * completion, account isolation) are covered at the unit/route/RLS layers —
 * see tests/unit/{services,app/api}/onboarding + tests/integration/security.
 *
 * MUST run with --workers=1 (shared Slack mock counters).
 */

let testUser: TestUser | null = null;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing Supabase admin env for e2e");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto("/auth/sign-in");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await Promise.all([
    page.waitForURL((url) => !/\/auth\/sign-in/.test(url.toString()), {
      timeout: 15_000,
    }),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

test.describe("5.ONBOARD-1 — first-workflow onboarding checklist", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("signup-equivalent → checklist → create → connect (highlight) → configure (focus) → test → activate → latched completion survives re-login", async ({
    page,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMockState();
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1–2. Sign in; the imported onboarding design renders on /workflows ──
    await signIn(page, user);
    await page.goto("/workflows");
    const card = page.getByTestId("onboarding-checklist-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Launch your first workflow");
    await expect(page.getByTestId("onboarding-step-create")).toHaveAttribute(
      "data-status",
      "current",
    );
    // The checklist REPLACES the no-workflows empty state (no duplicate CTA).
    await expect(page.getByTestId("workflows-empty-no-workflows")).toHaveCount(0);

    // ── 3–4. Create through the chooser (real workflow row) ──
    await page.getByTestId("onboarding-create-cta").click();
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByTestId("onboarding-create-scratch").click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 5. Step 1 complete; empty graph keeps Connect honest ──
    await page.goto("/workflows");
    await expect(page.getByTestId("onboarding-step-create")).toHaveAttribute(
      "data-status",
      "complete",
    );
    await expect(page.getByTestId("onboarding-step-connect")).toHaveAttribute(
      "data-status",
      "blocked",
    );

    // Give the workflow real steps (manual trigger + Slack action, config
    // still empty) via the API — the established e2e configure shortcut.
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "native",
          type: "manual.run",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "slack",
          type: "send_channel_message",
          config: {},
          position: { x: 0, y: 120 },
        },
      ],
      edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
    };
    const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);

    // ── 6–7. Connect step lists Slack; its CTA deep-links to the highlight ──
    await page.goto("/workflows");
    const connectStep = page.getByTestId("onboarding-step-connect");
    await expect(connectStep).toHaveAttribute("data-status", "current");
    await expect(page.getByTestId("onboarding-provider-slack")).toBeVisible();
    const connectCta = page.getByTestId("onboarding-step-connect-cta");
    await expect(connectCta).toHaveAttribute("href", "/apps?highlight=slack");
    await connectCta.click();

    // The Slack card is highlighted (attention only — OAuth NOT started).
    const slackCard = page.locator('[data-provider-id="slack"]');
    await expect(slackCard).toBeVisible();
    await expect(slackCard).toHaveAttribute("data-highlighted", "true");
    // The param was consumed.
    await expect(page).toHaveURL(/\/apps$/);

    // REAL OAuth dispatcher against the mock Slack (explicit click).
    await Promise.all([
      page.waitForURL(/integration=connected&provider=slack/),
      slackCard.getByRole("button", { name: "Connect Slack" }).click(),
    ]);
    const integrations = await getIntegrationsForUser(user.id, "slack");
    expect(integrations).toHaveLength(1);

    // ── 8. Step 2 complete ──
    await page.goto("/workflows");
    await expect(page.getByTestId("onboarding-step-connect")).toHaveAttribute(
      "data-status",
      "complete",
    );

    // ── 9. Configure focus deep link reveals the incomplete node's config ──
    const configureCta = page.getByTestId("onboarding-step-configure-cta");
    await expect(configureCta).toHaveAttribute(
      "href",
      `/workflows/${workflowId}?focus=setup`,
    );
    await configureCta.click();
    await page.waitForURL(new RegExp(`/workflows/${workflowId}`));
    // The builder opened the node-configuration drawer (navigation only).
    await expect(page.getByText("Node configuration")).toBeVisible({
      timeout: 15_000,
    });
    // The focus param was consumed.
    await expect(page).toHaveURL(new RegExp(`/workflows/${workflowId}$`));

    // ── 10–11. Complete the config (API shortcut) → Step 3 complete ──
    const configured = {
      ...draftDefinition,
      nodes: draftDefinition.nodes.map((n) =>
        n.id === "action-node"
          ? { ...n, config: { channel: "C-MOCK-CHANNEL", text: "Hello from onboarding e2e" } }
          : n,
      ),
    };
    const patch2 = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: { draftDefinition: configured },
    });
    expect(patch2.status(), await patch2.text()).toBe(200);
    await page.goto("/workflows");
    await expect(page.getByTestId("onboarding-step-configure")).toHaveAttribute(
      "data-status",
      "complete",
    );
    await expect(page.getByTestId("onboarding-step-test")).toHaveAttribute(
      "data-status",
      "current",
    );

    // ── 12–13. Run a REAL test (test-mode run on the draft) → Step 4 ──
    await page.goto(`/workflows/${workflowId}?focus=test`);
    await expect(
      page.getByTestId("builder-header-focus-pulse-test"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Test Workflow" }).click();
    await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.some((r) => r.status === "succeeded") ? rows : null;
      },
      { description: "succeeded test run", timeoutMs: 20_000 },
    );
    await page.goto("/workflows");
    await expect(page.getByTestId("onboarding-step-test")).toHaveAttribute(
      "data-status",
      "complete",
    );

    // ── 14–15. Activate → the imported success state, naming the workflow ──
    await page.goto(`/workflows/${workflowId}?focus=activate`);
    await expect(
      page.getByTestId("builder-header-focus-pulse-activate"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.locator("[data-status-kind=active]")).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/workflows");
    const success = page.getByTestId("onboarding-success-card");
    await expect(success).toBeVisible();
    await expect(success).toContainText("Your first workflow is live.");
    await expect(success).toContainText("My first workflow");
    await expect(success).toContainText("when its trigger occurs");

    // Completion provenance latched server-side.
    const state = await waitFor(
      async () => {
        const { data } = await admin()
          .from("user_onboarding_states")
          .select("completed_at, completion_workflow_id, completion_workflow_name")
          .eq("user_id", user.id)
          .not("completed_at", "is", null)
          .maybeSingle<{
            completed_at: string;
            completion_workflow_id: string;
            completion_workflow_name: string | null;
          }>();
        return data ?? null;
      },
      { description: "onboarding completion latch", timeoutMs: 10_000 },
    );
    expect(state!.completion_workflow_id).toBe(workflowId);
    // Provenance correction: the immutable name snapshot is latched atomically
    // with the id, from the workflow as it stood at activation.
    expect(state!.completion_workflow_name).toBe("My first workflow");

    // ── 16–18. Acknowledge; completion + dismissal survive re-login ──
    await success.getByTestId("onboarding-success-done").click();
    await expect(page.getByTestId("onboarding-checklist")).toHaveCount(0);

    await page.goto("/");
    await page.getByTestId("app-shell-user-menu-trigger").first().click();
    await Promise.all([
      page.waitForURL((url) => /\/($|auth)/.test(url.toString())),
      page.getByTestId("app-shell-sign-out").click(),
    ]);
    await signIn(page, user);
    await page.goto("/workflows");
    // Latched + dismissed: no checklist, no success card, no first-time reset.
    await expect(page.getByTestId("onboarding-checklist")).toHaveCount(0);
    const { data: after } = await admin()
      .from("user_onboarding_states")
      .select("completed_at, completion_workflow_id, completion_workflow_name")
      .eq("user_id", user.id)
      .not("completed_at", "is", null)
      .maybeSingle<{
        completed_at: string;
        completion_workflow_id: string | null;
        completion_workflow_name: string | null;
      }>();
    expect(after?.completed_at).toBe(state!.completed_at);
    expect(after?.completion_workflow_id).toBe(workflowId);

    // ── 19. DELETING the completion workflow must NOT erase the displayed
    // provenance: the FK is nulled, the snapshot survives, and the success
    // card still names the workflow that completed onboarding. ──
    const del = await page.request.delete(`/api/workflows/${workflowId}`);
    expect([200, 204]).toContain(del.status());

    const afterDelete = await waitFor(
      async () => {
        const { data } = await admin()
          .from("user_onboarding_states")
          .select("completed_at, completion_workflow_id, completion_workflow_name")
          .eq("user_id", user.id)
          .not("completed_at", "is", null)
          .maybeSingle<{
            completed_at: string;
            completion_workflow_id: string | null;
            completion_workflow_name: string | null;
          }>();
        return data ?? null;
      },
      { description: "onboarding row after workflow deletion", timeoutMs: 10_000 },
    );
    // completed_at is untouched; the snapshot name outlives the workflow row.
    expect(afterDelete!.completed_at).toBe(state!.completed_at);
    expect(afterDelete!.completion_workflow_name).toBe("My first workflow");

    // Reopen the checklist: the success state still NAMES it (unlinked).
    await page.goto("/workflows");
    await page.getByTestId("app-shell-user-menu-trigger").first().click();
    await page.getByTestId("app-shell-getting-started").click();
    const reopened = page.getByTestId("onboarding-success-card");
    await expect(reopened).toBeVisible();
    await expect(reopened).toContainText("My first workflow");
    await expect(
      page.getByTestId("onboarding-success-open-workflow"),
    ).toHaveCount(0);
  });

  test("bad paths: reconnect-required regresses Connect; automated trigger shows honest waiting copy", async ({
    page,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMockState();
    await page.request.post(`${mock.baseUrl}/__reset`);

    await signIn(page, user);

    // Create + shape the workflow (AUTOMATED Slack trigger — no manual test path).
    const created = await page.request.post(`/api/workflows`, {
      data: { name: "Automated onboarding wf" },
    });
    expect(created.status()).toBe(201);
    const workflowId = ((await created.json()) as { id: string }).id;
    const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: {
        draftDefinition: {
          nodes: [
            {
              id: "trigger-node",
              kind: "trigger" as const,
              provider: "slack",
              type: "slack.message.channel",
              config: {},
              position: { x: 0, y: 0 },
            },
            {
              id: "action-node",
              kind: "action" as const,
              provider: "slack",
              type: "send_channel_message",
              config: { channel: "C-MOCK-CHANNEL", text: "hi" },
              position: { x: 0, y: 120 },
            },
          ],
          edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
        },
      },
    });
    expect(patch.status()).toBe(200);

    // Connect Slack for real (mock boundary).
    await page.goto("/apps?highlight=slack");
    await Promise.all([
      page.waitForURL(/integration=connected&provider=slack/),
      page
        .locator('[data-provider-id="slack"]')
        .getByRole("button", { name: "Connect Slack" })
        .click(),
    ]);

    // Automated trigger: the Test step is honest — no fake test, waiting copy.
    await page.goto("/workflows");
    await expect(page.getByTestId("onboarding-step-connect")).toHaveAttribute(
      "data-status",
      "complete",
    );
    await expect(
      page.getByText(
        "Activate your workflow, and we'll confirm this step after its first successful run.",
      ),
    ).toBeVisible();

    // RECONNECT REGRESSION: mark the integration needs_reconnect (the same
    // seam the execution path uses) → Connect step regresses with the
    // reconnect treatment. Completion cannot go stale silently.
    const integrations = await getIntegrationsForUser(user.id, "slack");
    const { error } = await admin()
      .from("integrations")
      .update({ needs_reconnect_at: new Date().toISOString() })
      .eq("id", integrations[0]!.id);
    expect(error).toBeNull();

    await page.goto("/workflows");
    const connectStep = page.getByTestId("onboarding-step-connect");
    await expect(connectStep).toHaveAttribute("data-status", "blocked");
    await expect(page.getByTestId("onboarding-step-connect-blocked")).toContainText(
      /reconnect/i,
    );
    await expect(
      page.getByTestId("onboarding-step-connect-cta"),
    ).toContainText("Open Apps to reconnect");
  });
});
