import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  createTestUser,
  deleteTestUser,
  getDedupRow,
  getIntegrationsForUser,
  getNotificationsForUser,
  getOAuthStateRowCount,
  getTriggerResourcesForUser,
  getWorkflowRunsForUser,
  waitFor,
  type TestUser,
} from "./helpers/supabaseAdmin";
import { readMicrosoftMockState } from "./global-setup";

/**
 * Slice 16 end-to-end walkthrough — Microsoft Teams.
 *
 * Fifth Microsoft consumer of `_shared/microsoft/` after Outlook Mail,
 * Outlook Calendar, OneDrive, and Excel. Mirrors Slice 8 OneDrive shape
 * (Graph subscription + id-fetch hydration with
 * `includeResourceData: false`) with Teams-specific differences:
 *
 *   - Provider id `microsoft-teams`, sibling integration row.
 *   - Subscription on
 *     `/teams/{teamId}/channels/{channelId}/messages` with
 *     `changeType: "created"` (slice 6/7/8 use `created` / `updated`
 *     based on resource semantics; Batch 1 is created-only).
 *   - Trigger `new_channel_message`. Required config: teamId +
 *     channelId. No per-trigger filter fields (one event per new
 *     channel message; reply / mention / chat triggers deferred).
 *   - Activation does NOT walk a delta cursor — channel-messages
 *     subscriptions hydrate via id-fetch GET, not delta. Trigger
 *     config carries `subscriptionId`, `clientState` (32 hex chars),
 *     `teamId`, `channelId`, `resource`, `changeType: "created"`,
 *     `webhookEnabled: true`, `type: "subscription-watch"`,
 *     `expiresAt`.
 *   - Action `send_channel_message` exercises
 *     `POST /v1.0/teams/{teamId}/channels/{channelId}/messages` with
 *     `{ body: { contentType: 'html', content } }`. No
 *     conflictBehavior, no special headers — Teams is the simplest
 *     write contract of the Microsoft providers.
 *   - Webhook receiver: id-fetch branch ONLY — Graph deliveries for
 *     channel-messages always carry a usable `resourceData.id`.
 *   - Dedup key: `${subscriptionId}:${messageId}:created`. The
 *     `:created` infix future-proofs against a Batch 2 `updated`
 *     trigger.
 *
 * Real surfaces exercised:
 *   - Auth, OAuth dispatcher / state / PKCE, token encryption,
 *     integration row writeback, /me lookup.
 *   - Workflow create + activate; activation triggers Teams's
 *     activate hook → 32-byte hex clientState, 4230-min expiration,
 *     POST /subscriptions w/ resource=/teams/.../channels/.../messages
 *     & changeType=created.
 *   - Validation handshake (mock POSTs ?validationToken=…; V2's route
 *     echoes verbatim text/plain).
 *   - Webhook route: subscription lookup, clientState verify,
 *     chatMessage @odata.type filter, id-fetch via channelMessageGet,
 *     normalize, dispatch, dedup.
 *   - Engine + canonical resolver + send_channel_message handler.
 *
 * Mocked surfaces (Microsoft network boundary only):
 *   - login.microsoftonline.com /common/oauth2/v2.0/{authorize,token}
 *   - graph.microsoft.com /v1.0/me, /v1.0/subscriptions{,/id},
 *     /v1.0/teams/{teamId}/channels/{channelId}/messages (POST send),
 *     /v1.0/teams/{teamId}/channels/{channelId}/messages/{messageId}
 *     (GET hydration).
 *
 * Teams-specific assertions vs sibling Microsoft providers:
 *   - Authorize redirect_uri points at the Teams-specific callback
 *     `/api/integrations/oauth/microsoft-teams/callback`.
 *   - Authorize scope set is exactly the Batch 1 8-scope set
 *     (`offline_access`, `User.Read`, `ChannelMessage.Send`,
 *     `ChannelMessage.Read.All`, `Channel.ReadBasic.All`,
 *     `Team.ReadBasic.All`, `TeamMember.Read.All`, `Chat.ReadWrite`).
 *     NOT in scope: any admin-consent scope, `Channel.Create`,
 *     sibling-provider scopes.
 *   - Subscription resource path is
 *     `/teams/{teamId}/channels/{channelId}/messages` (NOT
 *     /me/drive/root or /me/messages).
 *   - subscription POST body does NOT include `includeResourceData`
 *     (V2 relies on Graph's default = false — no certificate cert
 *     plumbing).
 *   - clientState does NOT contain `workflow_<id>` (V1 rot fix).
 *   - Token exchange used PKCE + the shared MICROSOFT_CLIENT_ID
 *     (NOT the V1 `TEAMS_CLIENT_ID/SECRET` silo).
 *
 * Dedup probe: same subscriptionId + messageId emits twice. Second
 * delivery is caught by webhook_event_dedup at the dispatcher layer →
 * no duplicate workflow_run, no duplicate teamsChannelMessageSend
 * call. teamsChannelMessageGet IS called twice (the dedup gate is
 * downstream of normalize).
 */

let testUser: TestUser | null = null;

test.describe("Slice 16 — full Microsoft Teams walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Teams → build + activate → spoofed-clientState rejected → unknown subscription skipped → valid notification → succeeded run → dedup blocks duplicate", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMicrosoftMockState();

    // Per-run unique ids so webhook_event_dedup never collides across
    // consecutive runs. The mock resets its subscription counter on
    // /__reset; webhook_event_dedup is system-wide and doesn't cascade
    // with deleteTestUser.
    const teamId = `team-e2e-${randomUUID()}`;
    const channelId = `channel-e2e-${randomUUID()}`;
    const messageId = `msg-e2e-${randomUUID()}`;

    // Reset mock counters + state.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect Microsoft Teams ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=microsoft-teams/),
      page
        .getByRole("button", {
          name: "Connect Microsoft Teams",
          exact: true,
        })
        .click(),
    ]);

    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // DB assertions: integration row exists with encrypted tokens.
    const integrations = await getIntegrationsForUser(
      user.id,
      "microsoft-teams",
    );
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]! as Record<string, unknown>;
    expect(integration.provider_account_id).toBe("alice@e2e.test");
    expect(integration.access_token_encrypted).toBeTruthy();
    // Encryption invariant: ciphertext must NOT equal plaintext mock value.
    expect(integration.access_token_encrypted).not.toBe(
      "ms-mock-e2e-access",
    );
    expect(integration.refresh_token_encrypted).toBeTruthy();
    expect(integration.refresh_token_encrypted).not.toBe(
      "ms-mock-e2e-refresh",
    );
    // Scopes: the granted set echoed by the mock. The mock echoes
    // whatever the authorize scope was — so we'll check the authorize
    // request below contains the right scope set.
    const scopes = integration.scopes as readonly string[];
    expect(scopes).toEqual(
      expect.arrayContaining([
        "offline_access",
        "User.Read",
        "ChannelMessage.Send",
        "ChannelMessage.Read.All",
        "Channel.ReadBasic.All",
        "Team.ReadBasic.All",
        "TeamMember.Read.All",
        "Chat.ReadWrite",
      ]),
    );
    // Anti-tests: admin-consent / sibling-provider scopes absent.
    for (const wrong of [
      "Channel.Create",
      "Channel.Delete.All",
      "TeamMember.ReadWrite.All",
      "Team.Create",
      "User.Invite.All",
      "Chat.Create",
      "OnlineMeetings.ReadWrite",
      "Calendars.ReadWrite",
      "Files.ReadWrite",
      "Files.ReadWrite.All",
      "Mail.Send",
      "Mail.Read",
    ]) {
      expect(scopes).not.toContain(wrong);
    }

    // OAuth state row was atomically consumed.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // Mock-call assertions: authorize + token exchange + /me lookup.
    const callsAfterOAuth = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.me).toHaveLength(1);
    expect(callsAfterOAuth.calls.subscriptionsCreate).toHaveLength(0);
    expect(callsAfterOAuth.calls.teamsChannelMessageSend).toHaveLength(0);
    expect(callsAfterOAuth.calls.teamsChannelMessageGet).toHaveLength(0);

    // Authorize redirect_uri proves the dispatcher built the
    // Teams-specific callback URL (not a sibling provider's).
    expect(callsAfterOAuth.calls.authorize[0]!.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/microsoft-teams\/callback$/,
    );
    // Authorize scope: exactly the Slice 16 Batch 1 scope set,
    // space-separated.
    expect(callsAfterOAuth.calls.authorize[0]!.scope).toBe(
      "offline_access User.Read ChannelMessage.Send ChannelMessage.Read.All Channel.ReadBasic.All Team.ReadBasic.All TeamMember.Read.All Chat.ReadWrite",
    );
    // PKCE: code_challenge present + S256 (Microsoft v2 endpoint).
    expect(callsAfterOAuth.calls.authorize[0]!.codeChallenge).toBeTruthy();
    expect(callsAfterOAuth.calls.authorize[0]!.responseMode).toBe("query");
    // Token exchange used PKCE: code_verifier was sent.
    expect(
      callsAfterOAuth.calls.tokenExchange[0]!.parsedBody.code_verifier,
    ).toBeTruthy();
    expect(
      callsAfterOAuth.calls.tokenExchange[0]!.parsedBody.grant_type,
    ).toBe("authorization_code");
    // Token exchange used the SHARED Microsoft client id — NOT the
    // V1 `TEAMS_CLIENT_ID` silo. The Playwright config sets
    // MICROSOFT_CLIENT_ID=e2e-microsoft-client-id; if a regression
    // started reading TEAMS_CLIENT_ID, this would fail.
    expect(
      callsAfterOAuth.calls.tokenExchange[0]!.parsedBody.client_id,
    ).toBe("e2e-microsoft-client-id");

    // ── 4. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page.getByLabel(/workflow name/i).fill(
      "E2E Teams Walkthrough",
    );
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 5. Configure trigger + action via API patch ──
    // Action is `send_channel_message` so the journey exercises the
    // primary Teams write path. teamId/channelId on the action point
    // at the SAME channel as the trigger — common workflow shape
    // ("when a new message arrives, post an acknowledgement").
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "microsoft-teams",
          type: "new_channel_message",
          config: { teamId, channelId },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "microsoft-teams",
          type: "send_channel_message",
          // Hardcoded content — variable resolution from the trigger
          // event is unit-tested elsewhere; this e2e exercises the
          // notification → receive → dispatch → handler chain, not
          // variable plumbing. contentType=html is the documented
          // default but we set it explicitly for clarity.
          config: {
            teamId,
            channelId,
            content: "Echo from Teams trigger",
            contentType: "html",
          },
          position: { x: 0, y: 100 },
        },
      ],
      edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
    };
    const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);

    await page.reload();
    const nodeList = page.locator('ol[aria-label="Workflow nodes"]');
    await expect(nodeList.getByText(/trigger/i).first()).toBeVisible();
    await expect(nodeList.getByText(/action/i).first()).toBeVisible();

    // ── 6. Activate workflow via UI ──
    // Triggers Teams's activate hook: generates 32-byte hex
    // clientState, POSTs /subscriptions w/ resource=
    // /teams/{teamId}/channels/{channelId}/messages, changeType=created,
    // lifecycleNotificationUrl set, includeResourceData ABSENT (Graph
    // defaults to false — V2 relies on this to avoid certificate
    // plumbing). Mock validates by POSTing back to V2's webhook URL
    // with ?validationToken=…; V2's route echoes it as text/plain.
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // DB: trigger_resources row stores the subscription metadata.
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    expect(triggerAfterActivate.provider).toBe("microsoft-teams");
    expect(triggerAfterActivate.event_type).toBe("new_channel_message");
    const configAfterActivate = triggerAfterActivate.config as {
      type?: string;
      webhookEnabled?: boolean;
      resource?: string;
      changeType?: string;
      subscriptionId?: string;
      clientState?: string;
      teamId?: string;
      channelId?: string;
      expiresAt?: string;
    };
    expect(configAfterActivate.type).toBe("subscription-watch");
    expect(configAfterActivate.webhookEnabled).toBe(true);
    expect(configAfterActivate.resource).toBe(
      `/teams/${teamId}/channels/${channelId}/messages`,
    );
    expect(configAfterActivate.changeType).toBe("created");
    expect(configAfterActivate.teamId).toBe(teamId);
    expect(configAfterActivate.channelId).toBe(channelId);
    expect(configAfterActivate.subscriptionId).toBeTruthy();
    // 32 random bytes → 64 hex chars (V1 rot fix — no workflow_<id>).
    expect(configAfterActivate.clientState).toMatch(/^[0-9a-f]{64}$/);
    expect(configAfterActivate.clientState).not.toContain("workflow_");
    expect(configAfterActivate.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(configAfterActivate.expiresAt!).getTime()).toBeGreaterThan(
      Date.now(),
    );

    // Mock saw exactly one subscriptionsCreate AND validation matched.
    const callsAfterActivate = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.subscriptionsCreate).toHaveLength(1);
    const createCall = callsAfterActivate.calls.subscriptionsCreate[0]!;
    expect(createCall.responseSubscriptionId).toBe(
      configAfterActivate.subscriptionId,
    );
    expect(createCall.validationStatus).toBe(200);
    expect(createCall.validationEchoMatched).toBe(true);
    // Subscription request body asserts.
    expect(createCall.body.notificationUrl).toBe(
      `${mock.appBaseUrl}/api/webhooks/microsoft-teams`,
    );
    expect(createCall.body.lifecycleNotificationUrl).toBe(
      `${mock.appBaseUrl}/api/webhooks/microsoft-teams/lifecycle`,
    );
    expect(createCall.body.clientState).toBe(configAfterActivate.clientState);
    expect(createCall.body.resource).toBe(
      `/teams/${teamId}/channels/${channelId}/messages`,
    );
    expect(createCall.body.changeType).toBe("created");
    expect(createCall.body.expirationDateTime).toBe(
      configAfterActivate.expiresAt,
    );
    // V2's createSubscription wrapper does NOT pass
    // includeResourceData → Graph defaults to false. The Batch 1
    // contract relies on this; assert here.
    expect("includeResourceData" in createCall.body).toBe(false);
    // Auth used the access token from the OAuth callback (decrypted
    // through refreshAndRetry).
    expect(createCall.authorization).toBe("Bearer ms-mock-e2e-access");

    // ── 7a. Spoofed-clientState rejection ──
    // Inject a Graph chatMessage so the receiver wouldn't 404 if it
    // got past the clientState gate; then send a notification with a
    // deliberately wrong clientState. Per the V2 contract, the route
    // returns 200 (never 401) so probing isn't trivially easy, but the
    // dispatcher MUST NOT enqueue a workflow_run and the
    // send_channel_message action must NOT fire.
    const spoofedMessageId = `msg-spoof-${randomUUID()}`;
    await injectTeamsMessage(page, mock.baseUrl, {
      messageId: spoofedMessageId,
      teamId,
      channelId,
    });
    const spoofResp = await page.request.post(
      `${mock.baseUrl}/__sendNotification`,
      {
        data: {
          kind: "chatMessage",
          chatMessageId: spoofedMessageId,
          teamId,
          channelId,
          changeType: "created",
          clientStateOverride: "0".repeat(64), // wrong clientState
        },
      },
    );
    expect(spoofResp.status()).toBe(200);
    const spoofBody = (await spoofResp.json()) as {
      status: number;
      body: string;
    };
    // V2 webhook route returns 200 for clientState mismatch (skip + log,
    // never throw — avoids probing exposure).
    expect(spoofBody.status).toBe(200);
    // Wait briefly to assert NO run is enqueued.
    await new Promise((r) => setTimeout(r, 1500));
    const runsAfterSpoof = await getWorkflowRunsForUser(user.id);
    expect(runsAfterSpoof).toHaveLength(0);
    const callsAfterSpoof = await fetchMockCalls(request, mock.baseUrl);
    // teamsChannelMessageGet must NOT have been called (clientState
    // gate runs before hydration).
    expect(callsAfterSpoof.calls.teamsChannelMessageGet).toHaveLength(0);
    expect(callsAfterSpoof.calls.teamsChannelMessageSend).toHaveLength(0);

    // ── 7b. Unknown-subscription rejection ──
    // Post a hand-crafted notification envelope DIRECTLY to V2's
    // webhook route (bypassing the mock's __sendNotification which
    // forces subscriptionId to match a registered subscription). The
    // envelope carries a fabricated subscriptionId that no
    // trigger_resources row matches — receive.ts must log + skip
    // (no DB writes, no hydration, no dispatch) and the route returns
    // 200 with dispatched: 0.
    const unknownSubId = `ms-sub-unknown-${randomUUID()}`;
    const unknownSubResp = await page.request.post(
      `${mock.appBaseUrl}/api/webhooks/microsoft-teams`,
      {
        data: {
          value: [
            {
              subscriptionId: unknownSubId,
              subscriptionExpirationDateTime: "2026-05-12T00:00:00Z",
              changeType: "created",
              resource: `teams('${teamId}')/channels('${channelId}')/messages('${spoofedMessageId}')`,
              resourceData: {
                "@odata.type": "#Microsoft.Graph.chatMessage",
                id: spoofedMessageId,
              },
              clientState: configAfterActivate.clientState,
              tenantId: "tenant-e2e",
            },
          ],
        },
      },
    );
    expect(unknownSubResp.status()).toBe(200);
    const unknownSubBody = (await unknownSubResp.json()) as {
      ok: boolean;
      dispatched: number;
    };
    // V2's webhook route returns ok + dispatched=0 (no probing
    // exposure, no DB writes).
    expect(unknownSubBody).toEqual({ ok: true, dispatched: 0 });
    // Wait briefly to assert NO run is enqueued.
    await new Promise((r) => setTimeout(r, 1500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(0);
    const callsAfterUnknownSub = await fetchMockCalls(request, mock.baseUrl);
    // No hydration GET fired — the unknown-subscription gate ran
    // BEFORE pull.
    expect(callsAfterUnknownSub.calls.teamsChannelMessageGet).toHaveLength(0);
    expect(
      callsAfterUnknownSub.calls.teamsChannelMessageSend,
    ).toHaveLength(0);

    // ── 8. Inject the legitimate chatMessage and dispatch a notification ──
    await injectTeamsMessage(page, mock.baseUrl, {
      messageId,
      teamId,
      channelId,
    });
    const notifyResp = await page.request.post(
      `${mock.baseUrl}/__sendNotification`,
      {
        data: {
          kind: "chatMessage",
          chatMessageId: messageId,
          teamId,
          channelId,
          changeType: "created",
        },
      },
    );
    expect(notifyResp.status()).toBe(200);
    const notifyBody = (await notifyResp.json()) as {
      status: number;
      body: string;
    };
    expect(notifyBody.status).toBe(200);

    // ── 9. Wait for workflow_run → assert succeeded ──
    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      { description: "workflow_runs row to appear", timeoutMs: 15_000 },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as Record<string, unknown>;
    expect(run.status).toBe("succeeded");
    expect(run.error_classification).toBeNull();

    // ── 10. Mock saw exactly the expected Graph calls ──
    const callsAfterNotify = await fetchMockCalls(request, mock.baseUrl);
    // Hydration via id-fetch GET fired exactly once.
    expect(callsAfterNotify.calls.teamsChannelMessageGet).toHaveLength(1);
    expect(callsAfterNotify.calls.teamsChannelMessageGet[0]!.messageId).toBe(
      messageId,
    );
    expect(callsAfterNotify.calls.teamsChannelMessageGet[0]!.teamId).toBe(
      teamId,
    );
    expect(callsAfterNotify.calls.teamsChannelMessageGet[0]!.channelId).toBe(
      channelId,
    );
    expect(
      callsAfterNotify.calls.teamsChannelMessageGet[0]!.authorization,
    ).toBe("Bearer ms-mock-e2e-access");

    // send_channel_message action fired exactly once with the
    // resolved config.
    expect(callsAfterNotify.calls.teamsChannelMessageSend).toHaveLength(1);
    const sendCall = callsAfterNotify.calls.teamsChannelMessageSend[0]!;
    expect(sendCall.authorization).toBe("Bearer ms-mock-e2e-access");
    expect(sendCall.teamId).toBe(teamId);
    expect(sendCall.channelId).toBe(channelId);
    expect(sendCall.body).toEqual({
      body: { contentType: "html", content: "Echo from Teams trigger" },
    });

    // ── 11. Dedup row written ──
    // eventId = `${subscriptionId}:${messageId}:created`
    const dedupEventId = `${configAfterActivate.subscriptionId}:${messageId}:created`;
    const dedupRow = await getDedupRow("microsoft-teams", dedupEventId);
    expect(dedupRow).not.toBeNull();

    // ── 12. UI: Run history shows the succeeded run ──
    await page.reload();
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i)).toBeVisible();

    // ── 13. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ── 14. Dedup probe: send the SAME notification a second time ──
    // webhook_event_dedup catches the duplicate at the dispatcher
    // layer. teamsChannelMessageGet IS called again (the dedup gate
    // is downstream of normalize) but teamsChannelMessageSend must
    // NOT fire a second time and no second workflow run should
    // appear.
    const notifyResp2 = await page.request.post(
      `${mock.baseUrl}/__sendNotification`,
      {
        data: {
          kind: "chatMessage",
          chatMessageId: messageId,
          teamId,
          channelId,
          changeType: "created",
        },
      },
    );
    expect(notifyResp2.status()).toBe(200);

    // Give the engine a moment to NOT execute a second run.
    await new Promise((r) => setTimeout(r, 1500));

    const runsAfterReplay = await getWorkflowRunsForUser(user.id);
    expect(runsAfterReplay).toHaveLength(1);

    const callsAfterReplay = await fetchMockCalls(request, mock.baseUrl);
    // Hydration fired again on the second notification (2 total).
    expect(callsAfterReplay.calls.teamsChannelMessageGet).toHaveLength(2);
    // teamsChannelMessageSend count stayed at 1 — the load-bearing
    // assertion that the action did NOT double-fire.
    expect(callsAfterReplay.calls.teamsChannelMessageSend).toHaveLength(1);
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

/**
 * Inject a Teams chatMessage into the mock store so
 * `/v1.0/teams/{teamId}/channels/{channelId}/messages/{messageId}`
 * returns it on the receive path's id-fetch hydration.
 */
async function injectTeamsMessage(
  page: Page,
  mockBaseUrl: string,
  opts: {
    messageId: string;
    teamId: string;
    channelId: string;
  },
): Promise<void> {
  const resp = await page.request.post(`${mockBaseUrl}/__injectTeamsMessage`, {
    data: {
      id: opts.messageId,
      teamId: opts.teamId,
      channelId: opts.channelId,
      subject: "Project status check",
      summary: "Project status check preview",
      importance: "normal",
      messageType: "message",
      replyToId: null,
      body: {
        contentType: "html",
        content: "<p>Hello from a teammate</p>",
      },
      from: {
        user: {
          id: "ms-graph-uid-e2e",
          displayName: "Alice E2E",
          userIdentityType: "aadUser",
        },
      },
      createdDateTime: "2026-05-10T12:00:00Z",
      lastModifiedDateTime: "2026-05-10T12:00:00Z",
      webUrl: `https://teams.microsoft.com/l/message/${opts.channelId}/${opts.messageId}`,
    },
  });
  expect(resp.status()).toBe(200);
}

interface MockInspect {
  calls: {
    authorize: {
      state: string;
      scope: string;
      codeChallenge: string | null;
      redirectUri: string | null;
      responseMode: string | null;
    }[];
    tokenExchange: { body: string; parsedBody: Record<string, string> }[];
    me: { authorization: string | undefined; url: string }[];
    teamsChannelMessageSend: {
      authorization: string | undefined;
      teamId: string;
      channelId: string;
      body: Record<string, unknown>;
      responseMessageId: string;
    }[];
    teamsChannelMessageGet: {
      authorization: string | undefined;
      url: string;
      teamId: string;
      channelId: string;
      messageId: string;
    }[];
    subscriptionsCreate: {
      authorization: string | undefined;
      body: Record<string, unknown>;
      responseSubscriptionId: string;
      validationStatus: number | null;
      validationEchoMatched: boolean;
    }[];
    subscriptionsRenew: {
      authorization: string | undefined;
      subscriptionId: string;
      body: Record<string, unknown>;
    }[];
    subscriptionsDelete: {
      authorization: string | undefined;
      subscriptionId: string;
    }[];
  };
  subscriptions: Array<{
    id: string;
    resource: string;
    changeType: string;
    notificationUrl: string;
    expirationDateTime: string;
    clientState: string;
  }>;
  lastSubscriptionId: string | null;
}

async function fetchMockCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<MockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as MockInspect;
}
