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
 * is mocked): auth sign-in UI, the checklist on /workflows, the
 * create-chooser → real workflow creation, the /apps destination +
 * REAL OAuth dispatcher against the mock Slack, account-level integration
 * health driving step derivation, write-path readiness, a real test-mode run
 * (workflow_runs row), real activation (trigger registration + lifecycle), the
 * completion latch + success state, and persistence across sign-out/sign-in.
 *
 * 5.ONBOARD-4 — no feature flag any more. Both checklists are on by default, so
 * this journey exercises exactly what production serves. The second describe
 * block below covers the ROLE-SPECIFIC collaboration checklists end to end,
 * including real invitation acceptance through the /invitations/accept page.
 *
 * NOTE this first block deliberately keeps its user on their PERSONAL account.
 * On an eligible shared account the collaboration checklist WINS the floating
 * slot (OnboardingWidget mounts exactly one card), so the first-workflow
 * checklist would legitimately be absent.
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

  test("signup-equivalent → checklist → create → connect → configure (focus) → test → activate → latched completion survives re-login", async ({
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

    // ── 5. Step 1 complete; Connect is actionable even on an empty graph ──
    // 5.ONBOARD-3: the `blocked` status was removed and connect is no longer
    // skipped for a workflow with no steps. Connecting an app is a standalone
    // account-level action, so it is a legitimate next move immediately.
    await page.goto("/workflows");
    await expect(page.getByTestId("onboarding-step-create")).toHaveAttribute(
      "data-status",
      "complete",
    );
    await expect(page.getByTestId("onboarding-step-connect")).toHaveAttribute(
      "data-status",
      "current",
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

    // ── 6–7. Connect teaches the GENERAL action and lands on /apps ──
    // 5.ONBOARD-3: the step names no provider (no chips, no per-provider
    // readiness) and its CTA is a plain /apps link. The Apps page keeps its own
    // ?highlight= support for other callers; the CHECKLIST no longer uses it.
    await page.goto("/workflows");
    const connectStep = page.getByTestId("onboarding-step-connect");
    await expect(connectStep).toHaveAttribute("data-status", "current");
    await expect(connectStep).toContainText("Connect an app");
    // No provider identity is disclosed by the checklist.
    await expect(page.getByTestId("onboarding-provider-slack")).toHaveCount(0);
    const connectCta = page.getByTestId("onboarding-step-connect-cta");
    await expect(connectCta).toHaveAttribute("href", "/apps");
    await expect(connectCta).toHaveText(/Open Apps/);
    await connectCta.click();
    await expect(page).toHaveURL(/\/apps$/);

    const slackCard = page.locator(
      '[data-testid="app-card"][data-provider-id="slack"]',
    );
    await expect(slackCard).toBeVisible();

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

    // 5.ONBOARD-3: the regression is now expressed purely as the step becoming
    // incomplete again — `blocked`, the `-blocked` detail row, and the
    // "Open Apps to reconnect" CTA variant were all removed with the
    // provider-specific treatment. What still matters, and is asserted here, is
    // that a dead credential UN-COMPLETES the step rather than leaving a stale
    // green tick: isIntegrationHealthy() rejects a needs-reconnect row.
    await page.goto("/workflows");
    const connectStep = page.getByTestId("onboarding-step-connect");
    await expect(connectStep).not.toHaveAttribute("data-status", "complete");
    await expect(connectStep).toHaveAttribute("data-status", "current");
    // Still the general action — no provider named, no reconnect-specific copy.
    await expect(page.getByTestId("onboarding-step-connect-cta")).toHaveText(
      /Open Apps/,
    );
    await expect(page.getByTestId("onboarding-step-connect-cta")).toHaveAttribute(
      "href",
      "/apps",
    );
  });
});

/**
 * 5.ONBOARD-4 — role-specific collaboration onboarding, end to end.
 *
 * Exercises the parts that only a REAL multi-user, multi-account run can prove:
 * that the track a user gets is decided by their actual membership row, that an
 * invited user who accepts through the real /invitations/accept page lands on
 * the MEMBER checklist, and that only one floating card is ever on screen.
 *
 * Everything here is real: real team creation (which seeds plan='team', the
 * authoritative eligibility signal), real invitations with real single-use
 * tokens, real acceptance through the page + route, real membership rows, and
 * server-rendered checklists. Nothing is stubbed — there is no provider boundary
 * in this flow to mock.
 *
 * Fixture discipline (mirrors the Jest integration suites): every user, the team
 * account, and both invite tokens are built in `beforeAll` and fully awaited, so
 * no fixture creation is ever in flight while a test body runs. Teardown deletes
 * the INVITEES FIRST and the owner LAST — `deleteTestUser` cascades the owner's
 * account, and removing it first would strip the team out from under the
 * memberships still pointing at it.
 */
test.describe("5.ONBOARD-4 — role-specific collaboration onboarding", () => {
  // Serial: the three roles share one team account and its seat count.
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  let owner: TestUser | null = null;
  let adminUser: TestUser | null = null;
  let member: TestUser | null = null;
  let teamId = "";
  let adminToken = "";
  let memberToken = "";

  test.beforeAll(async ({ browser }) => {
    owner = await createTestUser();
    adminUser = await createTestUser();
    member = await createTestUser();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await signInViaEmailLink(page, owner);

      // Real team creation. `createTeamAccount` inserts the account + the owner
      // membership AND seeds account_billing with plan='team' — the authoritative
      // signal the collaboration checklist gates on — then auto-activates it.
      const created = await page.request.post("/api/accounts", {
        data: { name: "E2E Collab Team", type: "team" },
      });
      expect(created.status(), await created.text()).toBe(201);
      teamId = ((await created.json()) as { account: { id: string } }).account.id;

      // Real invitations. The raw token is returned ONLY on create, never stored
      // — exactly how a real invite link is produced.
      for (const [user, role] of [
        [adminUser, "admin"],
        [member, "member"],
      ] as const) {
        const invited = await page.request.post(
          `/api/accounts/${teamId}/invitations`,
          { data: { email: user.email, role } },
        );
        expect(invited.status(), await invited.text()).toBe(201);
        const body = (await invited.json()) as {
          acceptToken: string;
          acceptPath: string;
        };
        expect(body.acceptToken).toBeTruthy();
        // The path the notification actually links to — the one that used to 404.
        expect(body.acceptPath).toBe(
          `/invitations/accept?token=${encodeURIComponent(body.acceptToken)}`,
        );
        if (role === "admin") adminToken = body.acceptToken;
        else memberToken = body.acceptToken;
      }
    } finally {
      await ctx.close();
    }
  });

  test.afterAll(async () => {
    // Invitees first, owner last (owner's account delete cascades memberships).
    for (const u of [member, adminUser]) {
      if (u) await deleteTestUser(u.id);
    }
    if (owner) await deleteTestUser(owner.id);
    owner = adminUser = member = null;
  });

  test("owner sees the OWNER track with invite + teammate-join setup steps", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await signInViaEmailLink(page, owner!);
      await page.goto("/workflows");

      const card = page.getByTestId("collab-checklist-card");
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute("data-track", "team_owner");
      await expect(card).toContainText("Set up your team account");

      // The two owner setup steps exist.
      await expect(page.getByTestId("collab-step-invite_teammate")).toBeVisible();
      await expect(page.getByTestId("collab-step-teammate_joined")).toBeVisible();
      await expect(
        page.getByTestId("collab-step-connect_shared_app"),
      ).toBeVisible();
      await expect(
        page.getByTestId("collab-step-create_shared_workflow"),
      ).toBeVisible();

      // Invite is already satisfied — two invitations are pending.
      await expect(page.getByTestId("collab-step-invite_teammate")).toHaveAttribute(
        "data-status",
        "complete",
      );
      // ...but nobody has JOINED yet: a pending invite must not satisfy this.
      await expect(
        page.getByTestId("collab-step-teammate_joined"),
      ).not.toHaveAttribute("data-status", "complete");

      // ONLY ONE FLOATING CARD: the collaboration checklist owns the slot, so
      // the first-workflow checklist is not mounted at all.
      await expect(page.getByTestId("collab-checklist")).toHaveCount(1);
      await expect(page.getByTestId("onboarding-checklist")).toHaveCount(0);
      await expect(page.getByTestId("onboarding-checklist-card")).toHaveCount(0);

      // The CURRENT step is teammate_joined (invite is already satisfied), and
      // only the current step renders its CTA — a completed step collapses. That
      // CTA is navigation-only: a plain link to a page, never a mutation.
      await expect(page.getByTestId("collab-step-teammate_joined")).toHaveAttribute(
        "data-status",
        "current",
      );
      const ownerCta = page.getByTestId("collab-step-teammate_joined-cta");
      await expect(ownerCta).toHaveAttribute("href", "/team");
      await expect(ownerCta).toHaveJSProperty("tagName", "A");
    } finally {
      await ctx.close();
    }
  });

  test("invited MEMBER accepts through the real page and lands on the member checklist", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await signInViaEmailLink(page, member!);

      // The real invite link — the path the invitation service has always minted
      // and that had no page until 5.ONBOARD-4.
      await page.goto(
        `/invitations/accept?token=${encodeURIComponent(memberToken)}`,
      );
      await expect(page.getByTestId("accept-invitation-identity")).toContainText(
        member!.email,
      );

      // Acceptance is an explicit click, never a side effect of the GET.
      await Promise.all([
        page.waitForURL(/\/workflows/),
        page.getByTestId("accept-invitation-submit").click(),
      ]);

      // Joined the RIGHT account, and it auto-activated.
      const card = page.getByTestId("collab-checklist-card");
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute("data-track", "team_member");
      await expect(card).toContainText("Get started with your team");

      // MEMBERS NEVER GET OWNER SETUP STEPS.
      await expect(page.getByTestId("collab-step-invite_teammate")).toHaveCount(0);
      await expect(page.getByTestId("collab-step-teammate_joined")).toHaveCount(0);

      // They get the participation steps instead.
      await expect(page.getByTestId("collab-step-explore_workspace")).toBeVisible();
      await expect(
        page.getByTestId("collab-step-open_shared_workflow"),
      ).toBeVisible();
      await expect(
        page.getByTestId("collab-step-use_shared_workflow"),
      ).toBeVisible();
      await expect(page.getByTestId("collab-step-explore_directory")).toBeVisible();

      // Accepting activated the shared account, which is a REAL server-recorded
      // workspace exploration — so that learning step is genuinely complete.
      await expect(
        page.getByTestId("collab-step-explore_workspace"),
      ).toHaveAttribute("data-status", "complete");
      // ...while the steps needing evidence they have not produced are not.
      await expect(
        page.getByTestId("collab-step-use_shared_workflow"),
      ).not.toHaveAttribute("data-status", "complete");

      // Still exactly one floating card.
      await expect(page.getByTestId("collab-checklist")).toHaveCount(1);
      await expect(page.getByTestId("onboarding-checklist")).toHaveCount(0);

      // A member LEARNING step completes only from a real authorized visit.
      await expect(
        page.getByTestId("collab-step-explore_directory"),
      ).not.toHaveAttribute("data-status", "complete");
      await page.goto("/apps");
      await page.goto("/workflows");
      await expect(page.getByTestId("collab-step-explore_directory")).toHaveAttribute(
        "data-status",
        "complete",
      );
    } finally {
      await ctx.close();
    }
  });

  test("invited ADMIN gets the admin track — invite yes, owner-only join step no", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await signInViaEmailLink(page, adminUser!);
      await page.goto(
        `/invitations/accept?token=${encodeURIComponent(adminToken)}`,
      );
      await Promise.all([
        page.waitForURL(/\/workflows/),
        page.getByTestId("accept-invitation-submit").click(),
      ]);

      const card = page.getByTestId("collab-checklist-card");
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute("data-track", "team_admin");

      // Admins CAN invite (the invitations route allows owner+admin).
      await expect(page.getByTestId("collab-step-invite_teammate")).toBeVisible();
      // But the owner-only waiting step is ABSENT — not blocked, not disabled.
      await expect(page.getByTestId("collab-step-teammate_joined")).toHaveCount(0);
      // ...replaced by a real admin action.
      await expect(page.getByTestId("collab-step-review_team")).toBeVisible();

      await expect(page.getByTestId("collab-checklist")).toHaveCount(1);
      await expect(page.getByTestId("onboarding-checklist")).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test("the invite token is single-use and the page never leaks on failure", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      // A THIRD party replaying the member's already-used token.
      const stranger = await createTestUser();
      try {
        await signInViaEmailLink(page, stranger);
        await page.goto(
          `/invitations/accept?token=${encodeURIComponent(memberToken)}`,
        );
        await page.getByTestId("accept-invitation-submit").click();

        const error = page.getByTestId("accept-invitation-error");
        await expect(error).toBeVisible();
        // Refused, and the message discloses nothing about the account or the
        // address the invite was actually sent to.
        const text = (await error.textContent()) ?? "";
        expect(text).not.toContain(member!.email);
        expect(text).not.toContain("E2E Collab Team");
        expect(text).not.toContain(teamId);

        // The stranger did NOT join: still on their own personal account, which
        // is not collaboration-eligible, so there is no collaboration card.
        await page.goto("/workflows");
        await expect(page.getByTestId("collab-checklist")).toHaveCount(0);
      } finally {
        await deleteTestUser(stranger.id);
      }
    } finally {
      await ctx.close();
    }
  });

  test("the owner teammate-join step completes once members have actually joined", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await signInViaEmailLink(page, owner!);
      await page.goto("/workflows");
      // The two preceding tests joined real members, so this is now real.
      await expect(page.getByTestId("collab-step-teammate_joined")).toHaveAttribute(
        "data-status",
        "complete",
      );
    } finally {
      await ctx.close();
    }
  });

  test("a PERSONAL account gets no collaboration checklist", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const solo = await createTestUser();
    try {
      await signInViaEmailLink(page, solo);
      await page.goto("/workflows");
      // Personal accounts keep ONLY the first-workflow checklist.
      await expect(page.getByTestId("collab-checklist")).toHaveCount(0);
      await expect(page.getByTestId("onboarding-checklist")).toHaveCount(1);
    } finally {
      await deleteTestUser(solo.id);
      await ctx.close();
    }
  });
});
