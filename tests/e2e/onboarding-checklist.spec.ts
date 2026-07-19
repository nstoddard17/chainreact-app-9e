import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createTestUser,
  deleteTestUser,
  getIntegrationsForUser,
  getWorkflowRunsForUser,
  signInViaEmailLink,
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

/**
 * Establishes a real authenticated session without the password form, which
 * this project's CAPTCHA setting blocks locally. See `signInViaEmailLink` —
 * service-role token + the app's own /auth/callback; no app change, no bypass.
 */
async function signIn(page: Page, user: TestUser): Promise<void> {
  await signInViaEmailLink(page, user);
}

test.describe("5.ONBOARD-1 — first-workflow onboarding checklist", () => {
  // The primary journey is long by design (sign-in, create, real OAuth round
  // trip, configure, a real run, activation, re-login, deletion), far beyond
  // Playwright's 30s default. Without this the test aborts mid-flight and
  // `afterEach` deletes the user's memberships WHILE an OAuth callback is still
  // running, surfacing as a spurious `account_access_revoked`. Scoped to this
  // file so the other 21 specs keep the default.
  test.describe.configure({ timeout: 180_000 });

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
    // The dev server hydrates lazily, so a click can land on a not-yet-
    // interactive button and silently do nothing. Retry opening the chooser
    // until its content is actually present, then pick a path.
    await expect(async () => {
      await page.getByTestId("onboarding-create-cta").click();
      await expect(page.getByTestId("onboarding-create-scratch")).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 30_000 });
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
    const slackCard = page.locator(
      '[data-testid="app-card"][data-provider-id="slack"]',
    );
    await expect(slackCard).toBeVisible();
    await expect(slackCard).toHaveAttribute("data-highlighted", "true");
    // The param was consumed.
    await expect(page).toHaveURL(/\/apps$/);

    // The highlight is a TRANSIENT attention ring that clears itself (~2.6s),
    // re-rendering the card. Wait for it to settle before interacting so the
    // click cannot race that re-render (a retried click starts OAuth twice).
    // Waiting here also proves the highlight really is temporary.
    await expect(slackCard).not.toHaveAttribute("data-highlighted", "true", {
      timeout: 10_000,
    });

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
    // The builder proves activation by swapping the lifecycle control to Pause
    // (`data-status-kind` belongs to the workflows-LIST badge, not this header).
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible({
      timeout: 15_000,
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

    // The card hides optimistically; wait for the dismissal to actually PERSIST
    // before dropping the session, otherwise the in-flight request is cancelled
    // and the "still dismissed after re-login" assertion tests nothing.
    await waitFor(
      async () => {
        const { data } = await admin()
          .from("user_onboarding_states")
          .select("dismissed_at")
          .eq("user_id", user.id)
          .not("dismissed_at", "is", null)
          .maybeSingle<{ dismissed_at: string }>();
        return data ?? null;
      },
      { description: "onboarding dismissal persisted", timeoutMs: 10_000 },
    );

    // Drop the session the way signing out does (cookies cleared), then sign in
    // again. Equivalent for what this step proves — that completion lives in the
    // database, not client state — without depending on the user-menu popover.
    await page.context().clearCookies();
    await page.goto("/workflows");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
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

    // The success CARD is intentionally one-shot (it only renders while the
    // celebration is unacknowledged, and this user already acknowledged it), so
    // assert the surviving provenance where the UI reads it from: the DTO the
    // dashboard renders. Name preserved, id null ⇒ named but not linkable —
    // exactly what OnboardingSuccessCard renders (unit-covered).
    const dtoRes = await page.request.get("/api/onboarding");
    expect(dtoRes.status()).toBe(200);
    const dto = (await dtoRes.json()) as {
      completed?: boolean;
      completionWorkflow?: { id: string | null; name: string } | null;
    };
    expect(dto.completed).toBe(true);
    expect(dto.completionWorkflow).toEqual({
      id: null,
      name: "My first workflow",
    });
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
    const slackCardBad = page.locator(
      '[data-testid="app-card"][data-provider-id="slack"]',
    );
    await expect(slackCardBad).toBeVisible();
    // The highlight is applied by a CLIENT hook, so seeing it proves the page
    // hydrated (a pre-hydration click would silently no-op); then let it settle
    // so the click can't race the clearing re-render.
    await expect(slackCardBad).toHaveAttribute("data-highlighted", "true", {
      timeout: 15_000,
    });
    await expect(slackCardBad).not.toHaveAttribute("data-highlighted", "true", {
      timeout: 10_000,
    });
    await Promise.all([
      page.waitForURL(/integration=connected&provider=slack/),
      slackCardBad.getByRole("button", { name: "Connect Slack" }).click(),
    ]);

    // Automated trigger: the Test step is honest — no fake test, waiting copy.
    await page.goto("/workflows");
    await expect(page.getByTestId("onboarding-step-connect")).toHaveAttribute(
      "data-status",
      "complete",
    );
    // For an automated trigger the actionable step is Activate, so the Test row
    // is collapsed. Expand it (the collapsed label is a focusable button) and
    // confirm the honest copy — no fake test result is ever shown.
    await expect(page.getByTestId("onboarding-step-test")).toHaveAttribute(
      "data-status",
      "pending",
    );
    await page.getByTestId("onboarding-step-test-focus").click();
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
