import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import {
  createTestUser,
  deleteTestUser,
  getIntegrationsForUser,
  getNotificationsForUser,
  getWorkflowRunsForUser,
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

interface MockCalls {
  authorize: number;
  tokenExchange: { body: string; parsedBody: Record<string, string> }[];
  chatPostMessage: {
    authorization: string | undefined;
    body: { channel: string; text: string };
  }[];
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
