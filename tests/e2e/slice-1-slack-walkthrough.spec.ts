import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import {
  cleanupWorkflowFilesForUser,
  createTestUser,
  deleteTestUser,
  ensureWorkflowFilesBucket,
  getIntegrationsForUser,
  getNotificationsForUser,
  getWorkflowFilesForUser,
  getWorkflowRunsForUser,
  readWorkflowFileObject,
  seedWorkflowFile,
  waitFor,
  type TestUser,
} from "./helpers/supabaseAdmin";
import { readMockState } from "./global-setup";

/**
 * Slice 1 end-to-end walkthrough.
 *
 * Proves the full chain from sign-in through Slack OAuth (mocked at the
 * network boundary), workflow create + activate, signed Slack webhook
 * delivery, execution engine + handler dispatch, and run history surface.
 *
 * Real surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in)
 *   - OAuth dispatcher + signed state + atomic nonce consume
 *   - Service-role integration insert + token encryption
 *   - Workflow CRUD + lifecycle preconditions + activate transition
 *   - Trigger registration (DB row in trigger_resources)
 *   - Webhook receipt + HMAC verify + normalization
 *   - Provider-agnostic dispatcher + dedup
 *   - Execution engine + canonical resolver (strict mode) + handler registry
 *   - Slack send_channel_message handler + token decrypt
 *   - workflow_runs persistence + humanized error_classification (null on success)
 *   - In-app notification orchestrator (atomic claim; no fanout on success)
 *   - Run history UI + notifications UI surfaces
 *
 * Mocked surfaces (Slack network boundary only):
 *   - slack.com/oauth/v2/authorize → 302 to V2's callback with code+state
 *   - slack.com/api/oauth.v2.access → mock token exchange
 *   - slack.com/api/chat.postMessage → mock success
 *
 * NOT mocked: Slack webhook delivery — the test sends a real signed POST.
 *
 * UI shortcut: V2's builder UI doesn't have per-node configuration yet
 * (Slice 1I.2 was minimum picker + list + save). The test patches the
 * workflow draft via the API at step "configure nodes" so the trigger
 * + action have valid `type` + `config` for execution. When per-node
 * configuration UI ships, this step becomes a UI walkthrough.
 *
 * Repeatability: per-test random user via Supabase admin; afterEach
 * deletes the auth user so cascades clear all related rows.
 */

// Test user holder — populated in beforeEach, cleaned in afterEach.
let testUser: TestUser | null = null;

test.describe("Slice 1 — full Slack walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Slack → build + activate workflow → fire webhook → see succeeded run", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMockState();

    // Reset mock counters so per-test assertions are scoped to this run.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI (user already exists via admin createUser) ──
    await signIn(page, user);

    // ── 2. Visit home; assert signed-in surface + Notifications link ──
    await page.goto("/");
    await expect(
      page.getByText(`Signed in as`, { exact: false }),
    ).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();

    // ── 3. Connect Slack (UI → mocked authorize → V2 callback) ──
    // V2's callback redirects to /?integration=connected&provider=slack
    // (root, not /integrations). After OAuth lands, navigate back to
    // /integrations to verify the connected display.
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack" }).click(),
    ]);

    // After OAuth: navigate to integrations page; Slack row shows connected.
    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // DB assertions: integration row exists with mock-recognizable encrypted token.
    const integrations = await getIntegrationsForUser(user.id, "slack");
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]!;
    expect(integration.provider_account_id).toBe("T-MOCK-TEAM");
    expect(integration.access_token_encrypted).toBeTruthy();
    expect(integration.access_token_encrypted).not.toBe(
      "xoxb-mock-bot-token-e2e",
    );

    // Mock recorded exactly one token exchange.
    const callsAfterOAuth = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.authorize).toBe(1);
    expect(callsAfterOAuth.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.chatPostMessage).toHaveLength(0);

    // ── 4. Create workflow via UI ──
    // CreateWorkflowButton opens an inline form; type name, submit, navigate.
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page.getByLabel(/workflow name/i).fill("E2E Walkthrough Workflow");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 5. Configure trigger + action via API patch ──
    // V2's builder UI cannot configure node `type` + `config` yet (Slice 1I.2
    // was minimum picker + list + save). When per-node config UI ships,
    // replace this with UI interaction.
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "slack",
          // Canonical eventType per Slack 2.1 P-S2 contract — matches what
          // the normalizer emits for a `message` event in a public channel.
          // See docs/slices/slack-2-1-messaging-reactions-plan.md §3.
          type: "slack.message.channel",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "slack",
          type: "send_channel_message",
          config: { channel: "C-MOCK-CHANNEL", text: "Hello from e2e" },
          position: { x: 0, y: 100 },
        },
      ],
      edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
    };
    const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);

    // Reload so the server-rendered builder picks up the patched definition.
    await page.reload();
    const nodeList = page.locator('ol[aria-label="Workflow nodes"]');
    await expect(nodeList.getByText(/trigger/i).first()).toBeVisible();
    await expect(nodeList.getByText(/action/i).first()).toBeVisible();

    // ── 6. Activate workflow via UI ──
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // ── 7. POST signed Slack webhook event to V2 ──
    const webhookBody = buildSlackEventBody({ teamId: "T-MOCK-TEAM" });
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = signSlackWebhook(
      ts,
      webhookBody,
      requireEnv("SLACK_SIGNING_SECRET"),
    );
    const webhookResp = await request.post("/api/webhooks/slack", {
      headers: {
        "x-slack-request-timestamp": ts,
        "x-slack-signature": signature,
        "content-type": "application/json",
      },
      data: webhookBody,
    });
    expect(webhookResp.status(), await webhookResp.text()).toBe(200);

    // ── 8. Wait for execution → workflow_runs row → assert succeeded ──
    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      { description: "workflow_runs row to appear", timeoutMs: 15_000 },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    expect(run.status).toBe("succeeded");
    expect(run.error_classification).toBeNull();
    expect(run.error_notifications_sent_at).toBeNull();

    // Mock recorded exactly one chat.postMessage with our text.
    const callsAfterRun = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterRun.chatPostMessage).toHaveLength(1);
    expect(callsAfterRun.chatPostMessage[0]!.body).toEqual({
      channel: "C-MOCK-CHANNEL",
      text: "Hello from e2e",
    });
    // Authorization header carries the (decrypted) bot token.
    expect(callsAfterRun.chatPostMessage[0]!.authorization).toBe(
      "Bearer xoxb-mock-bot-token-e2e",
    );

    // ── 9. UI: Run history shows the succeeded run ──
    await page.reload();
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i)).toBeVisible();

    // ── 10. No notification on success path ──
    const notifications = await getNotificationsForUser(user.id);
    expect(notifications).toHaveLength(0);

    // /notifications page shows empty state.
    await page.goto("/notifications");
    await expect(page.getByText(/no notifications yet/i)).toBeVisible();
  });

  test("multi-workflow trigger filters: 5 workflows, channel + reaction filters, dedup before filter (Slack 2.1 P-S2)", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMockState();
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in + connect Slack (same as the base walkthrough) ──
    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack" }).click(),
    ]);
    const integrations = await getIntegrationsForUser(user.id, "slack");
    expect(integrations).toHaveLength(1);

    // ── 2. Create 5 workflows via API ──
    // Three share eventType slack.message.channel with different filter
    // configs; two share slack.reaction_added. The shared event type is
    // the whole point — proves the dispatcher fans out then filters.
    const channelEventType = "slack.message.channel";
    const reactionEventType = "slack.reaction_added";

    const workflowSpecs: ReadonlyArray<{
      key: string;
      name: string;
      triggerType: string;
      triggerConfig: Record<string, unknown>;
      actionChannel: string;
      actionText: string;
    }> = [
      {
        key: "wf-channel-match",
        name: "WF channel match (C-MATCH)",
        triggerType: channelEventType,
        triggerConfig: { channelId: "C0CHANNELMATCH" },
        actionChannel: "C-ACTION-A",
        actionText: "fired from WF-A",
      },
      {
        key: "wf-channel-other",
        name: "WF channel other (C-OTHER)",
        triggerType: channelEventType,
        triggerConfig: { channelId: "C0CHANNELOTHER" },
        actionChannel: "C-ACTION-B",
        actionText: "fired from WF-B",
      },
      {
        key: "wf-channel-anywhere",
        name: "WF channel anywhere (no filter)",
        triggerType: channelEventType,
        triggerConfig: {},
        actionChannel: "C-ACTION-C",
        actionText: "fired from WF-C",
      },
      {
        key: "wf-reaction-match",
        name: "WF thumbsup in C-REACT-MATCH",
        triggerType: reactionEventType,
        triggerConfig: {
          reactionEmoji: "thumbsup",
          channelId: "C0REACTIONMATCH",
        },
        actionChannel: "C-ACTION-D",
        actionText: "fired from WF-D",
      },
      {
        key: "wf-reaction-other",
        name: "WF tada anywhere",
        triggerType: reactionEventType,
        triggerConfig: { reactionEmoji: "tada" },
        actionChannel: "C-ACTION-E",
        actionText: "fired from WF-E",
      },
    ];

    interface CreatedWorkflow {
      id: string;
      key: string;
      actionChannel: string;
    }
    const createdWorkflows: CreatedWorkflow[] = [];

    for (const spec of workflowSpecs) {
      // Create
      const createResp = await page.request.post("/api/workflows", {
        data: { name: spec.name },
      });
      expect(createResp.status(), await createResp.text()).toBe(201);
      const created = (await createResp.json()) as { id: string };
      const wfId = created.id;

      // Patch draft with trigger + action.
      const draftDefinition = {
        nodes: [
          {
            id: "trigger-node",
            kind: "trigger" as const,
            provider: "slack",
            type: spec.triggerType,
            config: spec.triggerConfig,
            position: { x: 0, y: 0 },
          },
          {
            id: "action-node",
            kind: "action" as const,
            provider: "slack",
            type: "send_channel_message",
            config: { channel: spec.actionChannel, text: spec.actionText },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
      };
      const patch = await page.request.patch(`/api/workflows/${wfId}`, {
        data: { draftDefinition },
      });
      expect(patch.status(), await patch.text()).toBe(200);

      // Activate.
      const activate = await page.request.post(
        `/api/workflows/${wfId}/activate`,
      );
      expect(activate.status(), await activate.text()).toBe(200);

      createdWorkflows.push({
        id: wfId,
        key: spec.key,
        actionChannel: spec.actionChannel,
      });
    }
    expect(createdWorkflows).toHaveLength(5);

    // Reset mock counter so the chat.postMessage assertions count only
    // calls produced by the webhook phases below — not anything from
    // activation paths (none today, but defensive against future side
    // effects).
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 3. Phase A — POST a message event for C0CHANNELMATCH ──
    // Expected: WF-A (channelId match) + WF-C (no filter) fire.
    //           WF-B (different channelId) is silently skipped by the
    //           dispatcher's filter step. WF-D + WF-E ignore the event
    //           entirely (different eventType).
    const phaseAEventId = `Ev-channel-${Date.now()}`;
    const phaseAResp = await postSlackEvent(request, {
      eventId: phaseAEventId,
      event: {
        type: "message",
        channel: "C0CHANNELMATCH",
        channel_type: "channel",
        user: "U-SENDER",
        text: "hello",
        ts: `${Date.now() / 1000}`,
      },
    });
    expect(phaseAResp.status(), await phaseAResp.text()).toBe(200);

    await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length >= 2 ? rows : null;
      },
      {
        description:
          "phase A: 2 workflow_runs to appear (WF-A + WF-C)",
        timeoutMs: 15_000,
      },
    );
    // No additional runs should appear after a brief settle wait — proves
    // WF-B was silently dropped by the filter.
    await page.waitForTimeout(1_000);
    const phaseAFinal = await getWorkflowRunsForUser(user.id);
    expect(phaseAFinal).toHaveLength(2);

    const phaseAWorkflowIds = new Set(
      phaseAFinal.map((r) => r.workflow_id),
    );
    const wfA = createdWorkflows.find((w) => w.key === "wf-channel-match")!;
    const wfB = createdWorkflows.find((w) => w.key === "wf-channel-other")!;
    const wfC = createdWorkflows.find(
      (w) => w.key === "wf-channel-anywhere",
    )!;
    expect(phaseAWorkflowIds.has(wfA.id)).toBe(true);
    expect(phaseAWorkflowIds.has(wfC.id)).toBe(true);
    expect(phaseAWorkflowIds.has(wfB.id)).toBe(false);
    for (const run of phaseAFinal) {
      expect(run.status).toBe("succeeded");
    }
    // Mock should have seen exactly two chat.postMessage calls — one per
    // matching workflow's action. Channels are A + C (order unspecified
    // because the dispatcher enqueues in trigger_resources iteration
    // order which isn't a contract).
    const phaseACalls = await fetchMockCalls(request, mock.baseUrl);
    expect(phaseACalls.chatPostMessage).toHaveLength(2);
    const phaseAChannels = new Set(
      phaseACalls.chatPostMessage.map((c) => c.body.channel),
    );
    expect(phaseAChannels).toEqual(new Set(["C-ACTION-A", "C-ACTION-C"]));
    expect(phaseAChannels.has("C-ACTION-B")).toBe(false);

    // ── 4. Phase B — POST the SAME event id (dedup short-circuit) ──
    // The dispatcher dedups on (provider, eventId) BEFORE evaluating
    // filters. A duplicate delivery must NOT enqueue any additional
    // runs — even though the matching workflows are still active and
    // would otherwise re-fire.
    const phaseBResp = await postSlackEvent(request, {
      eventId: phaseAEventId, // same id on purpose
      event: {
        type: "message",
        channel: "C0CHANNELMATCH",
        channel_type: "channel",
        user: "U-SENDER",
        text: "hello (retry)",
        ts: `${Date.now() / 1000}`,
      },
    });
    expect(phaseBResp.status(), await phaseBResp.text()).toBe(200);

    // Brief settle then assert no new runs / no new mock calls.
    await page.waitForTimeout(2_000);
    const phaseBRuns = await getWorkflowRunsForUser(user.id);
    expect(phaseBRuns).toHaveLength(2); // still the same 2 from phase A
    const phaseBCalls = await fetchMockCalls(request, mock.baseUrl);
    expect(phaseBCalls.chatPostMessage).toHaveLength(2); // still 2

    // ── 5. Phase C — reaction_added event with item.channel filter ──
    // Reaction events carry the channel at payload.item.channel (NOT
    // payload.channel). The reaction filter must read that field.
    // Event: reaction=thumbsup, item.channel=C0REACTIONMATCH
    // Expected: WF-D fires (matches BOTH reaction + channel axes).
    //           WF-E does NOT (its reactionEmoji filter is "tada").
    const phaseCEventId = `Ev-reaction-${Date.now()}`;
    const phaseCResp = await postSlackEvent(request, {
      eventId: phaseCEventId,
      event: {
        type: "reaction_added",
        user: "U-REACTOR",
        reaction: "thumbsup",
        item: {
          type: "message",
          channel: "C0REACTIONMATCH",
          ts: `${Date.now() / 1000}`,
        },
        item_user: "U-AUTHOR",
        event_ts: `${Date.now() / 1000}`,
      },
    });
    expect(phaseCResp.status(), await phaseCResp.text()).toBe(200);

    const wfD = createdWorkflows.find((w) => w.key === "wf-reaction-match")!;
    const wfE = createdWorkflows.find((w) => w.key === "wf-reaction-other")!;

    await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        const reactionRuns = rows.filter((r) => r.workflow_id === wfD.id);
        return reactionRuns.length > 0 ? reactionRuns : null;
      },
      {
        description: "phase C: WF-D run to appear",
        timeoutMs: 15_000,
      },
    );

    // Settle, then re-fetch all runs.
    await page.waitForTimeout(1_000);
    const phaseCAllRuns = await getWorkflowRunsForUser(user.id);
    // Total = phase A's 2 + phase C's 1 (only WF-D, not WF-E).
    expect(phaseCAllRuns).toHaveLength(3);

    const phaseCWorkflowIds = new Set(phaseCAllRuns.map((r) => r.workflow_id));
    expect(phaseCWorkflowIds.has(wfD.id)).toBe(true);
    expect(phaseCWorkflowIds.has(wfE.id)).toBe(false);

    // Mock should have seen exactly 3 total chat.postMessage calls now
    // — 2 from phase A, 1 from WF-D's action in phase C.
    const phaseCCalls = await fetchMockCalls(request, mock.baseUrl);
    expect(phaseCCalls.chatPostMessage).toHaveLength(3);
    const phaseCChannels = new Set(
      phaseCCalls.chatPostMessage.map((c) => c.body.channel),
    );
    expect(phaseCChannels).toEqual(
      new Set(["C-ACTION-A", "C-ACTION-C", "C-ACTION-D"]),
    );
    expect(phaseCChannels.has("C-ACTION-E")).toBe(false);
  });

  test("private channels + channel lifecycle: 5 workflows, slack.message.group + channel_created + member_joined/left + G-prefix tightening (Slack 2.2)", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMockState();
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in + connect Slack ──
    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack" }).click(),
    ]);
    const integrations = await getIntegrationsForUser(user.id, "slack");
    expect(integrations).toHaveLength(1);

    // ── 2. Create 5 workflows via API covering Slack 2.2 trigger surface ──
    // WF-F: slack.message.group, channelId=CPRIV001  — private channel msg
    // WF-G: slack.channel_created, no config         — match-all lifecycle
    // WF-H: slack.member_joined_channel, channelId=CJOINED001
    // WF-I: slack.member_joined_channel, channelId=CJOINEDOTHER (no match)
    // WF-J: slack.member_left_channel, channelId=CLEFT001
    const workflowSpecs: ReadonlyArray<{
      key: string;
      name: string;
      triggerType: string;
      triggerConfig: Record<string, unknown>;
      actionChannel: string;
      actionText: string;
    }> = [
      {
        key: "wf-priv-msg",
        name: "WF private channel message (CPRIV001)",
        triggerType: "slack.message.group",
        triggerConfig: { channelId: "CPRIV001" },
        actionChannel: "C-ACTION-F",
        actionText: "fired from WF-F",
      },
      {
        key: "wf-channel-created",
        name: "WF channel created (match-all)",
        triggerType: "slack.channel_created",
        triggerConfig: {},
        actionChannel: "C-ACTION-G",
        actionText: "fired from WF-G",
      },
      {
        key: "wf-joined-match",
        name: "WF member joined CJOINED001",
        triggerType: "slack.member_joined_channel",
        triggerConfig: { channelId: "CJOINED001" },
        actionChannel: "C-ACTION-H",
        actionText: "fired from WF-H",
      },
      {
        key: "wf-joined-other",
        name: "WF member joined CJOINEDOTHER",
        triggerType: "slack.member_joined_channel",
        triggerConfig: { channelId: "CJOINEDOTHER" },
        actionChannel: "C-ACTION-I",
        actionText: "fired from WF-I",
      },
      {
        key: "wf-left",
        name: "WF member left CLEFT001",
        triggerType: "slack.member_left_channel",
        triggerConfig: { channelId: "CLEFT001" },
        actionChannel: "C-ACTION-J",
        actionText: "fired from WF-J",
      },
    ];

    interface CreatedWorkflow {
      id: string;
      key: string;
      actionChannel: string;
    }
    const createdWorkflows: CreatedWorkflow[] = [];
    for (const spec of workflowSpecs) {
      const createResp = await page.request.post("/api/workflows", {
        data: { name: spec.name },
      });
      expect(createResp.status(), await createResp.text()).toBe(201);
      const created = (await createResp.json()) as { id: string };
      const wfId = created.id;

      const draftDefinition = {
        nodes: [
          {
            id: "trigger-node",
            kind: "trigger" as const,
            provider: "slack",
            type: spec.triggerType,
            config: spec.triggerConfig,
            position: { x: 0, y: 0 },
          },
          {
            id: "action-node",
            kind: "action" as const,
            provider: "slack",
            type: "send_channel_message",
            config: { channel: spec.actionChannel, text: spec.actionText },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
      };
      const patch = await page.request.patch(`/api/workflows/${wfId}`, {
        data: { draftDefinition },
      });
      expect(patch.status(), await patch.text()).toBe(200);
      const activate = await page.request.post(
        `/api/workflows/${wfId}/activate`,
      );
      expect(activate.status(), await activate.text()).toBe(200);
      createdWorkflows.push({
        id: wfId,
        key: spec.key,
        actionChannel: spec.actionChannel,
      });
    }
    expect(createdWorkflows).toHaveLength(5);

    const wfF = createdWorkflows.find((w) => w.key === "wf-priv-msg")!;
    const wfG = createdWorkflows.find((w) => w.key === "wf-channel-created")!;
    const wfH = createdWorkflows.find((w) => w.key === "wf-joined-match")!;
    const wfI = createdWorkflows.find((w) => w.key === "wf-joined-other")!;
    const wfJ = createdWorkflows.find((w) => w.key === "wf-left")!;

    // Reset mock counters so action-side assertions are scoped to the
    // event-firing phases below.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 3. Phase A — private channel message (channel_type='group') ──
    // Expected: WF-F fires (channelId match). No other workflow fires.
    const phaseAResp = await postSlackEvent(request, {
      eventId: `Ev-priv-${Date.now()}`,
      event: {
        type: "message",
        channel: "CPRIV001",
        channel_type: "group",
        user: "U-SENDER",
        text: "secret",
        ts: `${Date.now() / 1000}`,
      },
    });
    expect(phaseAResp.status(), await phaseAResp.text()).toBe(200);

    await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length >= 1 ? rows : null;
      },
      {
        description: "phase A (Slack 2.2): WF-F run to appear",
        timeoutMs: 15_000,
      },
    );
    await page.waitForTimeout(1_000);
    const phaseARuns = await getWorkflowRunsForUser(user.id);
    expect(phaseARuns).toHaveLength(1);
    expect(phaseARuns[0].workflow_id).toBe(wfF.id);
    expect(phaseARuns[0].status).toBe("succeeded");

    // ── 4. Phase B — channel_created event ──
    // Expected: WF-G fires (match-all). Lifecycle filters for member
    // events (WF-H, WF-I, WF-J) do NOT fire on a different event type.
    const phaseBResp = await postSlackEvent(request, {
      eventId: `Ev-channelcreated-${Date.now()}`,
      event: {
        type: "channel_created",
        channel: {
          id: "C0NEWROOM",
          name: "new-room",
          is_private: false,
          created: Math.floor(Date.now() / 1000),
        },
        event_ts: `${Date.now() / 1000}`,
      },
    });
    expect(phaseBResp.status(), await phaseBResp.text()).toBe(200);

    await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.some((r) => r.workflow_id === wfG.id) ? rows : null;
      },
      {
        description: "phase B (Slack 2.2): WF-G run to appear",
        timeoutMs: 15_000,
      },
    );
    await page.waitForTimeout(1_000);
    const phaseBRuns = await getWorkflowRunsForUser(user.id);
    expect(phaseBRuns).toHaveLength(2); // A's WF-F + B's WF-G

    // ── 5. Phase C — member_joined_channel for CJOINED001 ──
    // Expected: WF-H fires (channelId match). WF-I (different channelId)
    // is silently skipped by the dispatcher's filter step.
    const phaseCResp = await postSlackEvent(request, {
      eventId: `Ev-joined-${Date.now()}`,
      event: {
        type: "member_joined_channel",
        user: "U-NEW-MEMBER",
        channel: "CJOINED001",
        channel_type: "C",
        team: "T-MOCK-TEAM",
        event_ts: `${Date.now() / 1000}`,
      },
    });
    expect(phaseCResp.status(), await phaseCResp.text()).toBe(200);

    await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.some((r) => r.workflow_id === wfH.id) ? rows : null;
      },
      {
        description: "phase C (Slack 2.2): WF-H run to appear",
        timeoutMs: 15_000,
      },
    );
    await page.waitForTimeout(1_000);
    const phaseCRuns = await getWorkflowRunsForUser(user.id);
    expect(phaseCRuns).toHaveLength(3); // A + B + C's WF-H
    const phaseCIds = new Set(phaseCRuns.map((r) => r.workflow_id));
    expect(phaseCIds.has(wfH.id)).toBe(true);
    expect(phaseCIds.has(wfI.id)).toBe(false); // WF-I silently dropped

    // ── 6. Phase D — member_left_channel for CLEFT001 ──
    // Expected: WF-J fires (channelId match).
    const phaseDResp = await postSlackEvent(request, {
      eventId: `Ev-left-${Date.now()}`,
      event: {
        type: "member_left_channel",
        user: "U-DEPARTING",
        channel: "CLEFT001",
        team: "T-MOCK-TEAM",
        event_ts: `${Date.now() / 1000}`,
      },
    });
    expect(phaseDResp.status(), await phaseDResp.text()).toBe(200);

    await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.some((r) => r.workflow_id === wfJ.id) ? rows : null;
      },
      {
        description: "phase D (Slack 2.2): WF-J run to appear",
        timeoutMs: 15_000,
      },
    );
    await page.waitForTimeout(1_000);
    const phaseDRuns = await getWorkflowRunsForUser(user.id);
    expect(phaseDRuns).toHaveLength(4); // A + B + C + D

    // ── 7. Phase E — G-prefix message with NO channel_type (Slack 2.2 tightening) ──
    // Pre-2.2 contract mapped this to slack.message.mpim by prefix; the
    // 2.2 tightening drops the heuristic (G is ambiguous between legacy
    // private channels and group DMs). The normalizer now emits generic
    // slack.message → no filter registered → dispatcher matched=0.
    // Expected: NO new workflow_runs row appears.
    const phaseEResp = await postSlackEvent(request, {
      eventId: `Ev-ambiguous-${Date.now()}`,
      event: {
        type: "message",
        // G-prefix with no channel_type — formerly mapped to mpim.
        channel: "G-AMBIGUOUS-1",
        user: "U-SENDER",
        text: "ambiguous",
        ts: `${Date.now() / 1000}`,
      },
    });
    expect(phaseEResp.status(), await phaseEResp.text()).toBe(200);

    // Settle and assert no additional runs were created.
    await page.waitForTimeout(2_000);
    const phaseERuns = await getWorkflowRunsForUser(user.id);
    expect(phaseERuns).toHaveLength(4); // unchanged from phase D

    // Mock action surface: exactly 4 chat.postMessage calls across all
    // four matched phases. Phase E produced zero.
    const phaseECalls = await fetchMockCalls(request, mock.baseUrl);
    expect(phaseECalls.chatPostMessage).toHaveLength(4);
    const phaseEChannels = new Set(
      phaseECalls.chatPostMessage.map((c) => c.body.channel),
    );
    expect(phaseEChannels).toEqual(
      new Set(["C-ACTION-F", "C-ACTION-G", "C-ACTION-H", "C-ACTION-J"]),
    );
    expect(phaseEChannels.has("C-ACTION-I")).toBe(false);
  });

  test("channels + users: full Slack 2.3 surface — 14 workflows, one event, 14 distinct endpoints (Slack 2.3 Commit 5)", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMockState();
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in + connect Slack ──
    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack" }).click(),
    ]);
    const integrations = await getIntegrationsForUser(user.id, "slack");
    expect(integrations).toHaveLength(1);

    // ── 2. Create 14 workflows — one per Slack 2.3 action ──
    // All share the same trigger (slack.message.channel with
    // channelId=C0SHARED) so a single Slack message event fans out
    // through all 14 workflows in one shot. Each workflow's action
    // exercises a distinct Slack endpoint on the mock server.
    interface ActionNode {
      provider: "slack";
      type: string;
      config: Record<string, unknown>;
    }
    const actionSpecs: ReadonlyArray<{
      key: string;
      action: ActionNode;
    }> = [
      {
        key: "list_channels",
        action: { provider: "slack", type: "list_channels", config: {} },
      },
      {
        key: "get_channel_info",
        action: {
          provider: "slack",
          type: "get_channel_info",
          config: { channel: "C0PUBLIC1" },
        },
      },
      {
        key: "create_channel",
        action: {
          provider: "slack",
          type: "create_channel",
          config: { name: "new-room", isPrivate: false },
        },
      },
      {
        key: "archive_channel",
        action: {
          provider: "slack",
          type: "archive_channel",
          config: { channel: "C0PUBLIC1" },
        },
      },
      {
        key: "unarchive_channel",
        action: {
          provider: "slack",
          type: "unarchive_channel",
          config: { channel: "C0PUBLIC1" },
        },
      },
      {
        key: "rename_channel",
        action: {
          provider: "slack",
          type: "rename_channel",
          config: { channel: "C0PUBLIC1", name: "renamed-room" },
        },
      },
      {
        key: "join_channel",
        action: {
          provider: "slack",
          type: "join_channel",
          config: { channel: "C0PUBLIC1" },
        },
      },
      {
        key: "leave_channel",
        action: {
          provider: "slack",
          type: "leave_channel",
          config: { channel: "C0PUBLIC1" },
        },
      },
      {
        key: "invite_users_to_channel",
        action: {
          provider: "slack",
          type: "invite_users_to_channel",
          config: {
            channel: "C0PUBLIC1",
            users: ["U0ALICE", "U0BOB"],
            sendInviteNotification: true,
          },
        },
      },
      {
        key: "remove_user_from_channel",
        action: {
          provider: "slack",
          type: "remove_user_from_channel",
          config: { channel: "C0PUBLIC1", user: "U0BOB" },
        },
      },
      {
        key: "set_channel_topic",
        action: {
          provider: "slack",
          type: "set_channel_topic",
          config: { channel: "C0PUBLIC1", topic: "New topic from e2e" },
        },
      },
      {
        key: "set_channel_purpose",
        action: {
          provider: "slack",
          type: "set_channel_purpose",
          config: { channel: "C0PUBLIC1", purpose: "New purpose from e2e" },
        },
      },
      {
        key: "get_user_info",
        action: {
          provider: "slack",
          type: "get_user_info",
          config: { user: "U0ALICE" },
        },
      },
      {
        key: "list_users",
        action: { provider: "slack", type: "list_users", config: {} },
      },
    ];
    expect(actionSpecs).toHaveLength(14);

    interface CreatedWorkflow {
      id: string;
      key: string;
    }
    const createdWorkflows: CreatedWorkflow[] = [];
    for (const spec of actionSpecs) {
      const createResp = await page.request.post("/api/workflows", {
        data: { name: `WF ${spec.key}` },
      });
      expect(createResp.status(), await createResp.text()).toBe(201);
      const created = (await createResp.json()) as { id: string };
      const wfId = created.id;

      const draftDefinition = {
        nodes: [
          {
            id: "trigger-node",
            kind: "trigger" as const,
            provider: "slack",
            type: "slack.message.channel",
            config: { channelId: "C0SHARED" },
            position: { x: 0, y: 0 },
          },
          {
            id: "action-node",
            kind: "action" as const,
            provider: spec.action.provider,
            type: spec.action.type,
            config: spec.action.config,
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
      };
      const patch = await page.request.patch(`/api/workflows/${wfId}`, {
        data: { draftDefinition },
      });
      expect(patch.status(), await patch.text()).toBe(200);

      const activate = await page.request.post(
        `/api/workflows/${wfId}/activate`,
      );
      expect(activate.status(), await activate.text()).toBe(200);
      createdWorkflows.push({ id: wfId, key: spec.key });
    }
    expect(createdWorkflows).toHaveLength(14);

    // Reset mock counters so action-side assertions count only the
    // single trigger fan-out below.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 3. POST one message event matching every workflow's filter ──
    const phaseEventId = `Ev-2-3-${Date.now()}`;
    const resp = await postSlackEvent(request, {
      eventId: phaseEventId,
      event: {
        type: "message",
        channel: "C0SHARED",
        channel_type: "channel",
        user: "U-SENDER",
        text: "fan out 2.3 surface",
        ts: `${Date.now() / 1000}`,
      },
    });
    expect(resp.status(), await resp.text()).toBe(200);

    // Wait for all 14 workflow_runs rows to appear.
    await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length >= 14 ? rows : null;
      },
      {
        description:
          "Slack 2.3: 14 workflow_runs to appear (one per Commit 5 workflow)",
        timeoutMs: 30_000,
      },
    );
    // Settle then assert no additional runs.
    await page.waitForTimeout(1_500);
    const runs = await getWorkflowRunsForUser(user.id);
    expect(runs).toHaveLength(14);
    for (const run of runs) {
      expect(run.status).toBe("succeeded");
    }
    // Every workflow that we created ran.
    const ranWorkflowIds = new Set(runs.map((r) => r.workflow_id));
    for (const wf of createdWorkflows) {
      expect(ranWorkflowIds.has(wf.id)).toBe(true);
    }

    // ── 4. Mock-side assertions: each Slack endpoint received exactly 1 call ──
    const calls = await fetchMockCalls(request, mock.baseUrl);
    expect(calls.conversationsList).toHaveLength(1);
    expect(calls.conversationsInfo).toHaveLength(1);
    expect(calls.conversationsCreate).toHaveLength(1);
    expect(calls.conversationsArchive).toHaveLength(1);
    expect(calls.conversationsUnarchive).toHaveLength(1);
    expect(calls.conversationsRename).toHaveLength(1);
    expect(calls.conversationsJoin).toHaveLength(1);
    expect(calls.conversationsLeave).toHaveLength(1);
    expect(calls.conversationsInvite).toHaveLength(1);
    expect(calls.conversationsKick).toHaveLength(1);
    expect(calls.conversationsSetTopic).toHaveLength(1);
    expect(calls.conversationsSetPurpose).toHaveLength(1);
    expect(calls.usersInfo).toHaveLength(1);
    expect(calls.usersList).toHaveLength(1);
    // chat.postMessage MUST NOT have been called — none of the 14
    // actions write a Slack message.
    expect(calls.chatPostMessage).toHaveLength(0);

    // Body-shape sanity for the two actions with the most interesting
    // wire shape: invite (CSV-joined users) + create (snake_case
    // is_private). These prove the wrappers serialize correctly
    // end-to-end (not just in their unit tests).
    expect(calls.conversationsInvite[0]!.body).toMatchObject({
      channel: "C0PUBLIC1",
      users: "U0ALICE,U0BOB",
    });
    expect(calls.conversationsCreate[0]!.body).toMatchObject({
      name: "new-room",
      is_private: false,
    });
    // Topic + purpose: the handler forwarded the caller's string.
    expect(calls.conversationsSetTopic[0]!.body).toMatchObject({
      channel: "C0PUBLIC1",
      topic: "New topic from e2e",
    });
    expect(calls.conversationsSetPurpose[0]!.body).toMatchObject({
      channel: "C0PUBLIC1",
      purpose: "New purpose from e2e",
    });
  });
});

/**
 * Slack 2.4 — file actions e2e block.
 *
 * Proves the FileRef contract end-to-end across all three Slack file
 * actions plus the provider_url rejection path. Per Slack 2.4 plan
 * §9 + accepted scope:
 *   - upload_file from a seeded `FileRef(kind=v2_storage)` →
 *     mock Slack's 3-step upload → output `FileRef(kind=provider_url)`.
 *   - download_file fetches Slack-served bytes with the bot bearer
 *     → stageFileToStorage writes to the workflow-files bucket →
 *     output `FileRef(kind=v2_storage)`. Asserts the metadata row
 *     + storage object both exist with the canonical path.
 *   - get_file_info → output `FileRef(kind=provider_url)` + flat
 *     metadata; no bytes/content/base64 in output.
 *   - upload_file rejects `FileRef(kind=provider_url)` BEFORE any
 *     Slack API call. (Per SlackUploadConfigError contract.)
 *
 * Real surfaces:
 *   - Supabase storage bucket (`workflow-files`) + `workflow_files`
 *     table (P-S3 Commit 3 stack).
 *   - Slack two-step upload flow (Commit 2 wrappers).
 *   - download_file (Commit 4) + get_file_info (Commit 4) handlers.
 *   - The engine's HANDLER_FAILED mapping for the rejection test.
 *
 * Mocked surfaces:
 *   - Slack file Web API endpoints (files.getUploadURLExternal,
 *     files.completeUploadExternal, files.info, /upload/<token>, and
 *     the `url_private_download` GET) on the mock Slack server.
 */
test.describe("Slice 2.4 — Slack file actions e2e", () => {
  let fileTestUser: TestUser | null = null;

  test.beforeEach(async () => {
    fileTestUser = await createTestUser();
    await ensureWorkflowFilesBucket();
  });

  test.afterEach(async () => {
    if (fileTestUser) {
      await cleanupWorkflowFilesForUser(fileTestUser.id);
      await deleteTestUser(fileTestUser.id);
      fileTestUser = null;
    }
  });

  test("upload_file from FileRef(v2_storage): Slack 3-step upload + FileRef(provider_url) output (no bytes/base64 in output)", async ({
    page,
    request,
  }) => {
    if (!fileTestUser) throw new Error("test user setup failed");
    const user = fileTestUser;
    const mock = await readMockState();
    await page.request.post(`${mock.baseUrl}/__reset`);

    // 1) Sign in + connect Slack.
    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack" }).click(),
    ]);
    const integrations = await getIntegrationsForUser(user.id, "slack");
    expect(integrations).toHaveLength(1);

    // 2) Create the workflow shell so we know the workflowId for the
    //    seeded FileRef's storage path. The seed runs BEFORE activation
    //    so the bytes exist when the workflow fires.
    const createResp = await page.request.post("/api/workflows", {
      data: { name: "WF upload_file from v2_storage" },
    });
    expect(createResp.status(), await createResp.text()).toBe(201);
    const wfId = ((await createResp.json()) as { id: string }).id;

    // 3) Seed bytes + workflow_files row for the upload input.
    //    run_id MUST be a uuid (workflow_files schema) — synthesize one
    //    here; no real workflow_runs row exists for this seed (the
    //    workflow_files.run_id column intentionally has no FK).
    const seedBytes = new Uint8Array([
      0xca, 0xfe, 0xba, 0xbe,
      ...Buffer.from("E2E_UPLOAD_PAYLOAD", "ascii"),
    ]);
    const seeded = await seedWorkflowFile({
      userId: user.id,
      workflowId: wfId,
      runId: crypto.randomUUID(),
      nodeId: "seed-node-upload",
      fileName: "e2e-upload.bin",
      mimeType: "application/octet-stream",
      bytes: seedBytes,
    });

    // 4) Patch the workflow draft with a slack.message.channel trigger
    //    and an upload_file action consuming the seeded FileRef.
    const fileRefInput = {
      kind: "v2_storage",
      name: seeded.fileName,
      mimeType: seeded.mimeType,
      sizeBytes: seeded.bytes.byteLength,
      storagePath: seeded.storagePath,
      provider: "slack",
    };
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "slack",
          type: "slack.message.channel",
          config: { channelId: "C0UPLOADTRIG" },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "slack",
          type: "upload_file",
          config: {
            channel: "C0UPLOADDEST",
            file: fileRefInput,
            title: "E2E upload title",
            initialComment: "E2E upload comment",
          },
          position: { x: 0, y: 100 },
        },
      ],
      edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
    };
    const patch = await page.request.patch(`/api/workflows/${wfId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    const activate = await page.request.post(
      `/api/workflows/${wfId}/activate`,
    );
    expect(activate.status(), await activate.text()).toBe(200);

    // 5) Fire the Slack trigger.
    const resp = await postSlackEvent(request, {
      eventId: `Ev-2.4-upload-${Date.now()}`,
      event: {
        type: "message",
        channel: "C0UPLOADTRIG",
        channel_type: "channel",
        user: "U-SENDER",
        text: "fire upload_file",
        ts: `${Date.now() / 1000}`,
      },
    });
    expect(resp.status(), await resp.text()).toBe(200);

    // 6) Wait for the workflow_runs row.
    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      { description: "workflow_runs row for upload_file", timeoutMs: 20_000 },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as {
      status: string;
      steps: Array<Record<string, unknown>>;
    };
    expect(run.status).toBe("succeeded");

    // 7) Mock-side assertions: each step of Slack's 3-step upload fired
    //    exactly once and received what we expected.
    const calls = await fetchMockCalls(request, mock.baseUrl);
    expect(calls.filesGetUploadURLExternal).toHaveLength(1);
    expect(calls.filesGetUploadURLExternal[0]!.body).toMatchObject({
      filename: seeded.fileName,
      length: String(seeded.bytes.byteLength),
    });

    expect(calls.filesUpload).toHaveLength(1);
    expect(calls.filesUpload[0]!.contentType).toBe("application/octet-stream");
    expect(calls.filesUpload[0]!.byteLength).toBe(seeded.bytes.byteLength);
    // Bytes match the seeded payload exactly.
    expect(calls.filesUpload[0]!.bytesBase64).toBe(
      Buffer.from(seedBytes).toString("base64"),
    );
    // The Slack-issued upload URL is one-shot pre-signed — no Bearer
    // header should be attached.
    expect(calls.filesUpload[0]!.authorization).toBeUndefined();

    expect(calls.filesCompleteUploadExternal).toHaveLength(1);
    expect(calls.filesCompleteUploadExternal[0]!.body).toMatchObject({
      files: [{ id: "F-MOCK-NEW", title: "E2E upload title" }],
      channel_id: "C0UPLOADDEST",
      initial_comment: "E2E upload comment",
    });

    // 8) Output assertions.
    const actionStep = (run.steps ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "action-node",
    ) as
      | { output?: Record<string, unknown>; status?: string }
      | undefined;
    expect(actionStep?.status).toBe("succeeded");
    const output = actionStep?.output ?? {};
    const file = output.file as Record<string, unknown> | undefined;
    expect(file?.kind).toBe("provider_url");
    expect(file?.provider).toBe("slack");
    expect(file?.providerFileId).toBe("F-MOCK-NEW");
    expect(output.fileId).toBe("F-MOCK-NEW");
    expect(output.channelIds).toEqual(["C0UPLOADDEST"]);
    // CLAUDE.md rule #1: outputs MUST NOT carry bytes / base64 / content / data.
    const outKeys = Object.keys(output);
    expect(outKeys).not.toContain("content");
    expect(outKeys).not.toContain("bytes");
    expect(outKeys).not.toContain("base64");
    expect(outKeys).not.toContain("data");
  });

  test("download_file: Slack url_private_download → workflow-files staging + FileRef(v2_storage) output", async ({
    page,
    request,
  }) => {
    if (!fileTestUser) throw new Error("test user setup failed");
    const user = fileTestUser;
    const mock = await readMockState();
    await page.request.post(`${mock.baseUrl}/__reset`);

    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack" }).click(),
    ]);

    const createResp = await page.request.post("/api/workflows", {
      data: { name: "WF download_file stages bytes" },
    });
    expect(createResp.status(), await createResp.text()).toBe(201);
    const wfId = ((await createResp.json()) as { id: string }).id;

    const targetFileId = "FDLE2E001";
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "slack",
          type: "slack.message.channel",
          config: { channelId: "C0DOWNLOADTRIG" },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "slack",
          type: "download_file",
          config: { fileId: targetFileId },
          position: { x: 0, y: 100 },
        },
      ],
      edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
    };
    const patch = await page.request.patch(`/api/workflows/${wfId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    const activate = await page.request.post(
      `/api/workflows/${wfId}/activate`,
    );
    expect(activate.status(), await activate.text()).toBe(200);

    const resp = await postSlackEvent(request, {
      eventId: `Ev-2.4-download-${Date.now()}`,
      event: {
        type: "message",
        channel: "C0DOWNLOADTRIG",
        channel_type: "channel",
        user: "U-SENDER",
        text: "fire download_file",
        ts: `${Date.now() / 1000}`,
      },
    });
    expect(resp.status(), await resp.text()).toBe(200);

    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      {
        description: "workflow_runs row for download_file",
        timeoutMs: 20_000,
      },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as {
      status: string;
      steps: Array<Record<string, unknown>>;
    };
    expect(run.status).toBe("succeeded");

    // Mock-side assertions.
    const calls = await fetchMockCalls(request, mock.baseUrl);
    expect(calls.filesInfo).toHaveLength(1);
    expect(calls.filesInfo[0]!.body).toMatchObject({ file: targetFileId });
    expect(calls.urlPrivateDownload).toHaveLength(1);
    expect(calls.urlPrivateDownload[0]!.authorization).toMatch(/^Bearer /i);
    // No upload paths fired — download is read-only on Slack's side.
    expect(calls.filesGetUploadURLExternal).toHaveLength(0);
    expect(calls.filesUpload).toHaveLength(0);
    expect(calls.filesCompleteUploadExternal).toHaveLength(0);

    // DB-side assertion: workflow_files row exists for the staged bytes.
    const stagedRows = await getWorkflowFilesForUser(user.id);
    // Filter to rows owned by this run's workflow (cleanup leaves the
    // seed-row pattern unused in this test, but be defensive).
    const stagedForWorkflow = stagedRows.filter(
      (r) => (r as { workflow_id?: string }).workflow_id === wfId,
    );
    expect(stagedForWorkflow).toHaveLength(1);
    const stagedRow = stagedForWorkflow[0]! as {
      storage_path: string;
      file_name: string;
      mime_type: string;
      size_bytes: number | null;
      metadata: Record<string, unknown>;
    };
    expect(stagedRow.file_name).toMatch(/FDLE2E001/);
    expect(stagedRow.mime_type).toBe("application/octet-stream");
    const runId = (run as unknown as { id: string }).id;
    expect(stagedRow.storage_path).toBe(
      `${user.id}/${wfId}/${runId}/action-node/${stagedRow.file_name}`,
    );
    expect(stagedRow.metadata.permalink).toMatch(/acme\.slack\.com/);

    // Storage object exists with the bytes the mock served.
    const stagedBytes = await readWorkflowFileObject(stagedRow.storage_path);
    expect(stagedBytes.byteLength).toBeGreaterThan(0);
    // Sentinel match — mock serves the same bytes for every fileId.
    const sentinel = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    expect(Buffer.from(stagedBytes.slice(0, 4))).toEqual(sentinel);

    // Output FileRef is kind=v2_storage with provider="slack" diagnostic.
    const actionStep = (run.steps ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "action-node",
    ) as
      | { output?: Record<string, unknown>; status?: string }
      | undefined;
    expect(actionStep?.status).toBe("succeeded");
    const output = actionStep?.output ?? {};
    const file = output.file as Record<string, unknown> | undefined;
    expect(file?.kind).toBe("v2_storage");
    expect(file?.provider).toBe("slack");
    expect(file?.storagePath).toBe(stagedRow.storage_path);
    expect(output.fileId).toBe(targetFileId);
    expect(output.mimeType).toBe("application/octet-stream");
    expect(output.sizeBytes).toBe(stagedBytes.byteLength);
    const outKeys = Object.keys(output);
    expect(outKeys).not.toContain("content");
    expect(outKeys).not.toContain("bytes");
    expect(outKeys).not.toContain("base64");
    expect(outKeys).not.toContain("data");
  });

  test("get_file_info: Slack files.info → FileRef(provider_url) output + flat metadata (no bytes in output)", async ({
    page,
    request,
  }) => {
    if (!fileTestUser) throw new Error("test user setup failed");
    const user = fileTestUser;
    const mock = await readMockState();
    await page.request.post(`${mock.baseUrl}/__reset`);

    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack" }).click(),
    ]);

    const createResp = await page.request.post("/api/workflows", {
      data: { name: "WF get_file_info" },
    });
    expect(createResp.status(), await createResp.text()).toBe(201);
    const wfId = ((await createResp.json()) as { id: string }).id;

    const targetFileId = "FINFOE2E001";
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "slack",
          type: "slack.message.channel",
          config: { channelId: "C0INFOTRIG" },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "slack",
          type: "get_file_info",
          config: { fileId: targetFileId, includeComments: false },
          position: { x: 0, y: 100 },
        },
      ],
      edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
    };
    const patch = await page.request.patch(`/api/workflows/${wfId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    const activate = await page.request.post(
      `/api/workflows/${wfId}/activate`,
    );
    expect(activate.status(), await activate.text()).toBe(200);

    const resp = await postSlackEvent(request, {
      eventId: `Ev-2.4-info-${Date.now()}`,
      event: {
        type: "message",
        channel: "C0INFOTRIG",
        channel_type: "channel",
        user: "U-SENDER",
        text: "fire get_file_info",
        ts: `${Date.now() / 1000}`,
      },
    });
    expect(resp.status(), await resp.text()).toBe(200);

    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      { description: "workflow_runs row for get_file_info", timeoutMs: 20_000 },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as {
      status: string;
      steps: Array<Record<string, unknown>>;
    };
    expect(run.status).toBe("succeeded");

    const calls = await fetchMockCalls(request, mock.baseUrl);
    expect(calls.filesInfo).toHaveLength(1);
    expect(calls.filesInfo[0]!.body).toMatchObject({ file: targetFileId });
    // get_file_info is metadata-only — bytes endpoint is NOT touched.
    expect(calls.urlPrivateDownload).toHaveLength(0);

    const actionStep = (run.steps ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "action-node",
    ) as
      | { output?: Record<string, unknown>; status?: string }
      | undefined;
    expect(actionStep?.status).toBe("succeeded");
    const output = actionStep?.output ?? {};
    const file = output.file as Record<string, unknown> | undefined;
    expect(file?.kind).toBe("provider_url");
    expect(file?.provider).toBe("slack");
    expect(file?.providerFileId).toBe(targetFileId);
    // Flat metadata projected alongside the FileRef.
    expect(output.fileId).toBe(targetFileId);
    expect(output.title).toBe(`Title for ${targetFileId}`);
    expect(output.fileType).toBe("binary");
    expect(output.mimeType).toBe("application/octet-stream");
    expect(typeof output.sizeBytes).toBe("number");
    expect(output.permalink).toMatch(/acme\.slack\.com/);
    expect(output.permalinkPublic).toMatch(/slack-files\.com/);
    expect(output.uploaderId).toBe("U0ALICE");
    expect(output.channels).toEqual(["C0SHARED", "C0PUBLIC1"]);
    expect(output.isPublic).toBe(false);
    expect(output.isExternal).toBe(false);
    expect(typeof output.createdAt).toBe("string");
    expect(output.commentsCount).toBe(0);
    expect(output.comments).toEqual([]);
    // No bytes.
    const outKeys = Object.keys(output);
    expect(outKeys).not.toContain("content");
    expect(outKeys).not.toContain("bytes");
    expect(outKeys).not.toContain("base64");
    expect(outKeys).not.toContain("data");
  });

  test("upload_file rejects FileRef(kind=provider_url) — workflow run fails with provider_url message, no Slack file API calls", async ({
    page,
    request,
  }) => {
    if (!fileTestUser) throw new Error("test user setup failed");
    const user = fileTestUser;
    const mock = await readMockState();
    await page.request.post(`${mock.baseUrl}/__reset`);

    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack" }).click(),
    ]);

    const createResp = await page.request.post("/api/workflows", {
      data: { name: "WF upload_file rejects provider_url" },
    });
    expect(createResp.status(), await createResp.text()).toBe(201);
    const wfId = ((await createResp.json()) as { id: string }).id;

    const providerUrlRef = {
      kind: "provider_url",
      name: "shared.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      url: "https://files.slack.com/files-pri/T1-F1/shared.pdf",
      provider: "slack",
      providerFileId: "FPROVIDEREXISTING",
    };
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "slack",
          type: "slack.message.channel",
          config: { channelId: "C0REJECTTRIG" },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "slack",
          type: "upload_file",
          config: {
            channel: "C0REJECTDEST",
            file: providerUrlRef,
          },
          position: { x: 0, y: 100 },
        },
      ],
      edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
    };
    const patch = await page.request.patch(`/api/workflows/${wfId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    const activate = await page.request.post(
      `/api/workflows/${wfId}/activate`,
    );
    expect(activate.status(), await activate.text()).toBe(200);

    const resp = await postSlackEvent(request, {
      eventId: `Ev-2.4-reject-${Date.now()}`,
      event: {
        type: "message",
        channel: "C0REJECTTRIG",
        channel_type: "channel",
        user: "U-SENDER",
        text: "fire upload_file with provider_url",
        ts: `${Date.now() / 1000}`,
      },
    });
    expect(resp.status(), await resp.text()).toBe(200);

    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      {
        description: "workflow_runs row for provider_url rejection",
        timeoutMs: 20_000,
      },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as {
      status: string;
      steps: Array<Record<string, unknown>>;
    };
    expect(run.status).toBe("failed");

    // The action step's error carries the SlackUploadConfigError
    // message — engine maps it to HANDLER_FAILED.
    const actionStep = (run.steps ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "action-node",
    ) as
      | { error?: { code?: string; message?: string }; status?: string }
      | undefined;
    expect(actionStep?.status).toBe("failed");
    expect(actionStep?.error?.code).toBe("HANDLER_FAILED");
    expect(actionStep?.error?.message).toMatch(/provider_url/);

    // Slack file endpoints NEVER touched.
    const calls = await fetchMockCalls(request, mock.baseUrl);
    expect(calls.filesGetUploadURLExternal).toHaveLength(0);
    expect(calls.filesUpload).toHaveLength(0);
    expect(calls.filesCompleteUploadExternal).toHaveLength(0);
    expect(calls.filesInfo).toHaveLength(0);
    expect(calls.urlPrivateDownload).toHaveLength(0);
  });
});

/**
 * Slack 2.5 — file_shared trigger e2e block.
 *
 * Proves the slack.file_shared trigger filter (Slack 2.5 Commit 2) end
 * to end against a real signed Slack webhook delivery + dispatcher +
 * filter registry + engine + action handler dispatch. Per Slack 2.5
 * plan §8 and the accepted Commit 3 scope (decisions A1 / B1 / C1):
 *
 *   1. match-all dispatch — one workflow with no channelId fires on
 *      any file_shared event; trigger payload preserves the raw Slack
 *      inner event fields (file_id / user_id / channel_id / event_ts /
 *      file:{id}) verbatim; no FileRef appears on the payload; no
 *      camelCase aliases injected.
 *   2. channelId match + no-match parity — two workflows differing
 *      only on `channelId` config; firing one file_shared event for
 *      the matching channel fires exactly the matching workflow,
 *      proving the filter reads `payload.channel_id` and not bare
 *      `payload.channel`.
 *   3. file_shared → slack:get_file_info composition — proves the
 *      trigger payload's file_id can feed a downstream
 *      slack:get_file_info action via the engine's `{{trigger.payload.file_id}}`
 *      template; mock `files.info` is called with that id; action
 *      output emits a populated FileRef(kind=provider_url) with the
 *      correct providerFileId; no bytes / base64 / content in output.
 *
 * Mocked surfaces: Slack file Web API endpoints on mockSlackServer
 * (files.info reuses the Slack 2.4 mock — no additions required).
 * Real surfaces: webhook HMAC verify, normalizer (auto-derives
 * `slack.file_shared`), filter registry (Slack 2.5 fileUploadedFilter),
 * dispatcher, engine, action handler (get_file_info for scenario 3),
 * variable resolution (`{{trigger.payload.file_id}}`), workflow_runs
 * persistence.
 *
 * No new manifest scopes (files:read already granted in Slack 2.4).
 * No new runtime code expected — the filter was added in Slack 2.5
 * Commit 2 (a11355e9e). If any e2e scenario surfaces a real bug, it
 * is fixed inline per the accepted scope; otherwise this block is
 * purely additive.
 *
 * Run discipline: serial (--workers=1) per the existing Slack
 * walkthrough convention (mockSlackServer __inspect counters are
 * process-shared).
 */
test.describe("Slice 2.5 — Slack file_shared trigger e2e", () => {
  let fileSharedTestUser: TestUser | null = null;

  test.beforeEach(async () => {
    fileSharedTestUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (fileSharedTestUser) {
      await deleteTestUser(fileSharedTestUser.id);
      fileSharedTestUser = null;
    }
  });

  test("file_shared match-all dispatch: trigger payload preserves raw Slack fields, no FileRef/aliases", async ({
    page,
    request,
  }) => {
    if (!fileSharedTestUser) throw new Error("test user setup failed");
    const user = fileSharedTestUser;
    const mock = await readMockState();
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in + connect Slack ──
    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack" }).click(),
    ]);
    const integrations = await getIntegrationsForUser(user.id, "slack");
    expect(integrations).toHaveLength(1);

    // ── 2. Create workflow: slack.file_shared (no channelId) +
    //     send_channel_message action so the run succeeds without
    //     depending on a file API mock. The point of this scenario
    //     is proving dispatch + payload preservation, not file I/O.
    const createResp = await page.request.post("/api/workflows", {
      data: { name: "WF file_shared match-all" },
    });
    expect(createResp.status(), await createResp.text()).toBe(201);
    const wfId = ((await createResp.json()) as { id: string }).id;

    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "slack",
          type: "slack.file_shared",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "slack",
          type: "send_channel_message",
          config: {
            channel: "C0FSHAREDACK",
            text: "file_shared trigger fired (match-all)",
          },
          position: { x: 0, y: 100 },
        },
      ],
      edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
    };
    const patch = await page.request.patch(`/api/workflows/${wfId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    const activate = await page.request.post(
      `/api/workflows/${wfId}/activate`,
    );
    expect(activate.status(), await activate.text()).toBe(200);

    // Reset mock counters so the action assertion is scoped to this run.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 3. POST a file_shared event_callback envelope ──
    //
    // Mirrors the V1 fixture
    // (lib/workflows/testing/fixtures/webhooks/slack/file-shared.json):
    // Slack's raw inner event carries ONLY file_id / user_id /
    // channel_id / event_ts / partial file:{id}. No name, no mimetype,
    // no size, no url. The trigger must not synthesize anything richer.
    const eventTs = `${Date.now() / 1000}`;
    const triggerEventId = `Ev-2.5-match-all-${Date.now()}`;
    const phaseResp = await postSlackEvent(request, {
      eventId: triggerEventId,
      event: {
        type: "file_shared",
        file_id: "F0FSHARED001",
        user_id: "U0FSHAREDUPLOADER",
        channel_id: "C0FSHAREDSOURCE",
        event_ts: eventTs,
        file: { id: "F0FSHARED001" },
      },
    });
    expect(phaseResp.status(), await phaseResp.text()).toBe(200);

    // ── 4. Wait for workflow_runs row ──
    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      {
        description: "workflow_runs row for file_shared match-all",
        timeoutMs: 20_000,
      },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as {
      status: string;
      workflow_id: string;
      steps: Array<Record<string, unknown>>;
    };
    expect(run.workflow_id).toBe(wfId);
    expect(run.status).toBe("succeeded");

    // ── 5. Trigger payload assertions ──
    const triggerStep = (run.steps ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "trigger-node",
    ) as { output?: Record<string, unknown>; status?: string } | undefined;
    expect(triggerStep?.status).toBe("succeeded");
    const triggerEvent = (triggerStep?.output as { event?: Record<string, unknown> })
      ?.event;
    expect(triggerEvent).toBeDefined();
    expect(triggerEvent?.provider).toBe("slack");
    expect(triggerEvent?.eventType).toBe("slack.file_shared");
    expect(triggerEvent?.eventId).toBe(triggerEventId);
    expect(triggerEvent?.accountId).toBe("T-MOCK-TEAM");

    // Payload is the inner Slack `event` object verbatim — raw passthrough,
    // no aliases. Per Slack 2.5 decision A1.
    const payload = triggerEvent?.payload as Record<string, unknown> | undefined;
    expect(payload).toBeDefined();
    expect(payload?.type).toBe("file_shared");
    expect(payload?.file_id).toBe("F0FSHARED001");
    expect(payload?.user_id).toBe("U0FSHAREDUPLOADER");
    expect(payload?.channel_id).toBe("C0FSHAREDSOURCE");
    expect(payload?.event_ts).toBe(eventTs);
    // Partial `file: { id }` stub Slack ships — id only, no FileRef
    // shape.
    expect(payload?.file).toEqual({ id: "F0FSHARED001" });

    // ── 6. No camelCase aliases (decision A1 — raw passthrough only) ──
    const payloadKeys = Object.keys(payload ?? {});
    expect(payloadKeys).not.toContain("fileId");
    expect(payloadKeys).not.toContain("userId");
    expect(payloadKeys).not.toContain("channelId");
    const eventKeys = Object.keys(triggerEvent ?? {});
    expect(eventKeys).not.toContain("fileId");
    expect(eventKeys).not.toContain("userId");
    expect(eventKeys).not.toContain("channelId");

    // ── 7. No FileRef on trigger payload (decision §5 — Slack's raw
    //      event has no name/mime/size/url, so a FileRef cannot honestly
    //      be constructed; workflows compose slack:get_file_info
    //      downstream for that). The partial `file: { id }` stub is NOT
    //      a FileRef.
    const fileObj = payload?.file as Record<string, unknown> | undefined;
    expect(fileObj).toBeDefined();
    // FileRef discriminator fields MUST be absent.
    expect(fileObj?.kind).toBeUndefined();
    expect(fileObj?.provider).toBeUndefined();
    expect(fileObj?.providerFileId).toBeUndefined();
    expect(fileObj?.storagePath).toBeUndefined();
    expect(fileObj?.url).toBeUndefined();
    expect(fileObj?.mimeType).toBeUndefined();
    expect(fileObj?.sizeBytes).toBeUndefined();
    // Only `id` is present.
    expect(Object.keys(fileObj ?? {})).toEqual(["id"]);

    // ── 8. No bytes/base64/content/data anywhere on trigger payload ──
    expect(payloadKeys).not.toContain("content");
    expect(payloadKeys).not.toContain("bytes");
    expect(payloadKeys).not.toContain("base64");
    expect(payloadKeys).not.toContain("data");

    // ── 9. send_channel_message ran exactly once with the configured text ──
    const calls = await fetchMockCalls(request, mock.baseUrl);
    expect(calls.chatPostMessage).toHaveLength(1);
    expect(calls.chatPostMessage[0]!.body).toEqual({
      channel: "C0FSHAREDACK",
      text: "file_shared trigger fired (match-all)",
    });
    // Slack file API endpoints NEVER touched (this scenario doesn't
    // exercise file I/O).
    expect(calls.filesInfo).toHaveLength(0);
    expect(calls.filesGetUploadURLExternal).toHaveLength(0);
    expect(calls.filesUpload).toHaveLength(0);
    expect(calls.filesCompleteUploadExternal).toHaveLength(0);
    expect(calls.urlPrivateDownload).toHaveLength(0);
  });

  test("channelId match + no-match: filter reads payload.channel_id (not payload.channel); only matching workflow runs", async ({
    page,
    request,
  }) => {
    if (!fileSharedTestUser) throw new Error("test user setup failed");
    const user = fileSharedTestUser;
    const mock = await readMockState();
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in + connect Slack ──
    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack" }).click(),
    ]);

    // ── 2. Create two workflows differing only on channelId config ──
    //   WF-MATCH:    channelId="C0FSHAREDMATCH"
    //   WF-MISMATCH: channelId="C0FSHAREDOTHER"
    const workflowSpecs: ReadonlyArray<{
      key: string;
      name: string;
      channelId: string;
      actionChannel: string;
      actionText: string;
    }> = [
      {
        key: "wf-match",
        name: "WF file_shared channelId match (C0FSHAREDMATCH)",
        channelId: "C0FSHAREDMATCH",
        actionChannel: "C0FSHAREDACKMATCH",
        actionText: "fired from WF-match",
      },
      {
        key: "wf-mismatch",
        name: "WF file_shared channelId mismatch (C0FSHAREDOTHER)",
        channelId: "C0FSHAREDOTHER",
        actionChannel: "C0FSHAREDACKMISMATCH",
        actionText: "fired from WF-mismatch",
      },
    ];

    interface CreatedWorkflow {
      id: string;
      key: string;
    }
    const createdWorkflows: CreatedWorkflow[] = [];
    for (const spec of workflowSpecs) {
      const createResp = await page.request.post("/api/workflows", {
        data: { name: spec.name },
      });
      expect(createResp.status(), await createResp.text()).toBe(201);
      const wfId = ((await createResp.json()) as { id: string }).id;

      const draftDefinition = {
        nodes: [
          {
            id: "trigger-node",
            kind: "trigger" as const,
            provider: "slack",
            type: "slack.file_shared",
            config: { channelId: spec.channelId },
            position: { x: 0, y: 0 },
          },
          {
            id: "action-node",
            kind: "action" as const,
            provider: "slack",
            type: "send_channel_message",
            config: { channel: spec.actionChannel, text: spec.actionText },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
      };
      const patch = await page.request.patch(`/api/workflows/${wfId}`, {
        data: { draftDefinition },
      });
      expect(patch.status(), await patch.text()).toBe(200);
      const activate = await page.request.post(
        `/api/workflows/${wfId}/activate`,
      );
      expect(activate.status(), await activate.text()).toBe(200);

      createdWorkflows.push({ id: wfId, key: spec.key });
    }
    expect(createdWorkflows).toHaveLength(2);
    const wfMatch = createdWorkflows.find((w) => w.key === "wf-match")!;
    const wfMismatch = createdWorkflows.find((w) => w.key === "wf-mismatch")!;

    // Reset mock counters so chat.postMessage assertion is scoped to
    // this firing phase only.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 3. Fire one file_shared event with channel_id="C0FSHAREDMATCH" ──
    //
    // Regression guard: the event ALSO carries `channel: "C0FSHAREDOTHER"`
    // (bare, the way `message` events shape it). If the filter mistakenly
    // read `payload.channel`, WF-mismatch would fire instead of WF-match
    // — that's the bug the unit test pins, and this e2e reaffirms.
    const eventTs = `${Date.now() / 1000}`;
    const phaseResp = await postSlackEvent(request, {
      eventId: `Ev-2.5-channelid-${Date.now()}`,
      event: {
        type: "file_shared",
        file_id: "F0FSHAREDFILTER001",
        user_id: "U0FSHAREDUPLOADER",
        channel_id: "C0FSHAREDMATCH",
        channel: "C0FSHAREDOTHER", // <-- intentional decoy; filter must IGNORE this
        event_ts: eventTs,
        file: { id: "F0FSHAREDFILTER001" },
      },
    });
    expect(phaseResp.status(), await phaseResp.text()).toBe(200);

    // ── 4. Wait for the matching workflow's run; settle to ensure the
    //      mismatched workflow does NOT enqueue a run.
    await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.some((r) => r.workflow_id === wfMatch.id) ? rows : null;
      },
      {
        description: "phase: WF-match run to appear",
        timeoutMs: 15_000,
      },
    );
    // Settle to confirm no second run sneaks in.
    await page.waitForTimeout(1_500);
    const phaseFinal = await getWorkflowRunsForUser(user.id);
    expect(phaseFinal).toHaveLength(1);
    expect(phaseFinal[0]!.workflow_id).toBe(wfMatch.id);
    expect(phaseFinal[0]!.status).toBe("succeeded");

    // Defensive: explicitly assert WF-mismatch did NOT enqueue a run.
    const mismatchRuns = phaseFinal.filter(
      (r) => r.workflow_id === wfMismatch.id,
    );
    expect(mismatchRuns).toHaveLength(0);

    // ── 5. Action-mock assertion: chat.postMessage fired EXACTLY once
    //      with WF-match's channel + text. WF-mismatch's action MUST
    //      NOT have fired.
    const calls = await fetchMockCalls(request, mock.baseUrl);
    expect(calls.chatPostMessage).toHaveLength(1);
    expect(calls.chatPostMessage[0]!.body).toEqual({
      channel: "C0FSHAREDACKMATCH",
      text: "fired from WF-match",
    });

    // ── 6. Reaffirm the regression guard: payload.channel was
    //      "C0FSHAREDOTHER" (WF-mismatch's filter target) but the
    //      filter correctly read payload.channel_id ("C0FSHAREDMATCH")
    //      and matched WF-match. The fact that WF-mismatch did NOT
    //      fire proves payload.channel was NOT used. Documented inline.
  });

  test("file_shared → slack:get_file_info composition: trigger payload.file_id resolves into action, FileRef(provider_url) emitted", async ({
    page,
    request,
  }) => {
    if (!fileSharedTestUser) throw new Error("test user setup failed");
    const user = fileSharedTestUser;
    const mock = await readMockState();
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in + connect Slack ──
    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack" }).click(),
    ]);

    // ── 2. Create workflow: file_shared trigger → get_file_info action.
    //      The action's fileId is templated from the trigger payload via
    //      `{{trigger.payload.file_id}}`. The engine's strict resolver
    //      resolves this BEFORE dispatching to the handler.
    const createResp = await page.request.post("/api/workflows", {
      data: { name: "WF file_shared → get_file_info composition" },
    });
    expect(createResp.status(), await createResp.text()).toBe(201);
    const wfId = ((await createResp.json()) as { id: string }).id;

    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "slack",
          type: "slack.file_shared",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "slack",
          type: "get_file_info",
          config: {
            fileId: "{{trigger.payload.file_id}}",
            includeComments: false,
          },
          position: { x: 0, y: 100 },
        },
      ],
      edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
    };
    const patch = await page.request.patch(`/api/workflows/${wfId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    const activate = await page.request.post(
      `/api/workflows/${wfId}/activate`,
    );
    expect(activate.status(), await activate.text()).toBe(200);

    // Reset counters so the files.info assertion is scoped to this run.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 3. Fire file_shared event with a specific file_id ──
    const composedFileId = "F0FCOMPOSE001";
    const eventTs = `${Date.now() / 1000}`;
    const phaseResp = await postSlackEvent(request, {
      eventId: `Ev-2.5-compose-${Date.now()}`,
      event: {
        type: "file_shared",
        file_id: composedFileId,
        user_id: "U0FSHAREDUPLOADER",
        channel_id: "C0FSHAREDCOMPOSE",
        event_ts: eventTs,
        file: { id: composedFileId },
      },
    });
    expect(phaseResp.status(), await phaseResp.text()).toBe(200);

    // ── 4. Wait for the run ──
    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      {
        description: "workflow_runs row for composition scenario",
        timeoutMs: 20_000,
      },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as {
      status: string;
      workflow_id: string;
      steps: Array<Record<string, unknown>>;
    };
    expect(run.workflow_id).toBe(wfId);
    expect(run.status).toBe("succeeded");

    // ── 5. Mock-side: files.info called exactly once with the resolved
    //      file id from the trigger payload. The byte download endpoint
    //      MUST NOT be touched (get_file_info is metadata-only).
    const calls = await fetchMockCalls(request, mock.baseUrl);
    expect(calls.filesInfo).toHaveLength(1);
    expect(calls.filesInfo[0]!.body).toMatchObject({ file: composedFileId });
    expect(calls.urlPrivateDownload).toHaveLength(0);
    expect(calls.filesGetUploadURLExternal).toHaveLength(0);
    expect(calls.filesUpload).toHaveLength(0);
    expect(calls.filesCompleteUploadExternal).toHaveLength(0);

    // ── 6. Action output assertions ──
    const actionStep = (run.steps ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "action-node",
    ) as { output?: Record<string, unknown>; status?: string } | undefined;
    expect(actionStep?.status).toBe("succeeded");
    const output = actionStep?.output ?? {};
    const file = output.file as Record<string, unknown> | undefined;
    expect(file?.kind).toBe("provider_url");
    expect(file?.provider).toBe("slack");
    expect(file?.providerFileId).toBe(composedFileId);
    // Flat metadata projected by get_file_info — mirrors Slack 2.4's
    // get_file_info scenario shape.
    expect(output.fileId).toBe(composedFileId);
    expect(output.mimeType).toBe("application/octet-stream");
    expect(output.uploaderId).toBe("U0ALICE"); // mock files.info returns canned uploader

    // ── 7. No bytes / base64 / content / data anywhere in the action
    //      output (P-S3 durable rule #1). Reaffirms the composition
    //      path doesn't introduce byte leakage.
    const outKeys = Object.keys(output);
    expect(outKeys).not.toContain("content");
    expect(outKeys).not.toContain("bytes");
    expect(outKeys).not.toContain("base64");
    expect(outKeys).not.toContain("data");

    // ── 8. Trigger payload assertion (reaffirms scenario 1's invariants
    //      in the composition context — raw passthrough, no FileRef on
    //      payload, no aliases). Lighter-weight than scenario 1 since
    //      scenario 1 owns the deep coverage.
    const triggerStep = (run.steps ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "trigger-node",
    ) as { output?: Record<string, unknown>; status?: string } | undefined;
    expect(triggerStep?.status).toBe("succeeded");
    const triggerEvent = (triggerStep?.output as { event?: Record<string, unknown> })
      ?.event;
    const payload = triggerEvent?.payload as Record<string, unknown> | undefined;
    expect(payload?.file_id).toBe(composedFileId);
    expect(payload?.channel_id).toBe("C0FSHAREDCOMPOSE");
    // No FileRef on trigger payload's file stub.
    const fileObj = payload?.file as Record<string, unknown> | undefined;
    expect(Object.keys(fileObj ?? {})).toEqual(["id"]);
  });
});


// ── helpers ─────────────────────────────────────────────────────────────

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

interface RecordedSlackApiCall {
  authorization: string | undefined;
  body: Record<string, unknown>;
}

interface RecordedRawUpload {
  uploadToken: string;
  authorization: string | undefined;
  contentType: string | undefined;
  byteLength: number;
  bytesBase64: string;
}

interface RecordedFileDownload {
  path: string;
  authorization: string | undefined;
}

interface MockCalls {
  authorize: number;
  tokenExchange: { body: string; parsedBody: Record<string, string> }[];
  chatPostMessage: {
    authorization: string | undefined;
    body: { channel: string; text: string };
  }[];
  // Slack 2.3 — channel admin
  conversationsList: RecordedSlackApiCall[];
  conversationsInfo: RecordedSlackApiCall[];
  conversationsCreate: RecordedSlackApiCall[];
  conversationsArchive: RecordedSlackApiCall[];
  conversationsUnarchive: RecordedSlackApiCall[];
  conversationsRename: RecordedSlackApiCall[];
  conversationsJoin: RecordedSlackApiCall[];
  conversationsLeave: RecordedSlackApiCall[];
  conversationsInvite: RecordedSlackApiCall[];
  conversationsKick: RecordedSlackApiCall[];
  conversationsSetTopic: RecordedSlackApiCall[];
  conversationsSetPurpose: RecordedSlackApiCall[];
  // Slack 2.3 — user lookups
  usersInfo: RecordedSlackApiCall[];
  usersList: RecordedSlackApiCall[];
  // Slack 2.4 — file actions
  filesGetUploadURLExternal: RecordedSlackApiCall[];
  filesUpload: RecordedRawUpload[];
  filesCompleteUploadExternal: RecordedSlackApiCall[];
  filesInfo: RecordedSlackApiCall[];
  urlPrivateDownload: RecordedFileDownload[];
}

async function fetchMockCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<MockCalls> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as MockCalls;
}

function buildSlackEventBody(opts: { teamId: string }): string {
  return JSON.stringify({
    type: "event_callback",
    team_id: opts.teamId,
    event_id: `Ev${Date.now()}`,
    event_time: Math.floor(Date.now() / 1000),
    event: {
      type: "message",
      channel: "C-MOCK-CHANNEL",
      user: "U-MOCK-SENDER",
      text: "test message",
      ts: `${Date.now() / 1000}`,
    },
  });
}

function signSlackWebhook(
  ts: string,
  rawBody: string,
  signingSecret: string,
): string {
  const base = `v0:${ts}:${rawBody}`;
  const hex = createHmac("sha256", signingSecret).update(base).digest("hex");
  return `v0=${hex}`;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`e2e: ${name} env var is required`);
  return v;
}

/**
 * Build + sign + POST a Slack event_callback envelope to V2's
 * webhook receive route. Used by the multi-workflow filter test
 * to fire arbitrary inner event shapes (message / reaction_added)
 * with caller-controlled eventIds (so dedup behavior is testable).
 */
async function postSlackEvent(
  request: APIRequestContext,
  opts: { eventId: string; event: Record<string, unknown> },
): Promise<Awaited<ReturnType<APIRequestContext["post"]>>> {
  const body = JSON.stringify({
    type: "event_callback",
    team_id: "T-MOCK-TEAM",
    event_id: opts.eventId,
    event_time: Math.floor(Date.now() / 1000),
    event: opts.event,
  });
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = signSlackWebhook(
    ts,
    body,
    requireEnv("SLACK_SIGNING_SECRET"),
  );
  return request.post("/api/webhooks/slack", {
    headers: {
      "x-slack-request-timestamp": ts,
      "x-slack-signature": signature,
      "content-type": "application/json",
    },
    data: body,
  });
}
