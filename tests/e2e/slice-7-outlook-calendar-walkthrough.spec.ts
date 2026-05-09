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
 * Slice 7 end-to-end walkthrough — Microsoft Outlook Calendar.
 *
 * Mirrors Slice 6 (Outlook Mail) shape. Differences:
 *   - Provider id `microsoft-outlook-calendar`, sibling integration row.
 *   - Subscription on `/me/events` with
 *     `changeType: "created,updated,deleted"`.
 *   - Trigger `event_changed` (consolidated, NOT V1's three).
 *   - Action `create_event` exercises POST `/v1.0/me/events`.
 *   - Webhook receiver fetches `/v1.0/me/events/{id}` (not /messages).
 *   - Dedup key: `${subscriptionId}:${eventId}:${changeType}`.
 *
 * Real surfaces exercised:
 *   - Auth, OAuth dispatcher / state / PKCE, token encryption,
 *     integration row writeback, /me lookup.
 *   - Workflow create + activate; activation triggers Calendar's
 *     activate hook → 32-byte hex clientState, 4230-min expiration,
 *     POST /subscriptions w/ resource=/me/events &
 *     changeType=created,updated,deleted.
 *   - Validation handshake (mock POSTs ?validationToken=…; V2's route
 *     echoes verbatim text/plain).
 *   - Webhook route: subscription lookup, clientState verify, eventsGet,
 *     normalize, dispatch, dedup.
 *   - Engine + canonical resolver + create_event handler (Q11 strict
 *     schema with required isAllDay + responseRequested).
 *
 * Mocked surfaces (Microsoft network boundary only):
 *   - login.microsoftonline.com /common/oauth2/v2.0/{authorize,token}
 *   - graph.microsoft.com /v1.0/me, /v1.0/subscriptions{,/id},
 *     /v1.0/me/events (POST), /v1.0/me/events/{id} (GET).
 *
 * Calendar-specific assertions vs Slice 6 mail:
 *   - changeType is the consolidated `created,updated,deleted` (not just
 *     `created`).
 *   - Subscription resource is `/me/events`.
 *   - Spoofed-clientState path: webhook returns 200 (per the V2
 *     contract — never throw on mismatch to avoid probing exposure)
 *     but does NOT enqueue a workflow_run.
 *   - Action call is eventsCreate (POST /me/events), NOT sendMail.
 *
 * Dedup probe: same subscriptionId + eventId + changeType emits twice.
 * Second delivery is caught by webhook_event_dedup at the dispatcher
 * layer → no duplicate run, no duplicate eventsCreate call.
 */

let testUser: TestUser | null = null;

test.describe("Slice 7 — full Outlook Calendar walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Outlook Calendar → build + activate → notification → succeeded run → spoofed-clientState rejected → duplicate notification dedups", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMicrosoftMockState();

    // Per-run unique eventId so webhook_event_dedup never collides
    // across consecutive runs. Same caveat as Slice 6 — the mock resets
    // its subscription counter on /__reset; webhook_event_dedup is
    // system-wide and doesn't cascade with deleteTestUser.
    const eventId = `AAMkAGI2-cal-e2e-${randomUUID()}`;

    // Reset mock counters + Microsoft state.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect Microsoft Outlook Calendar ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(
        /\/\?integration=connected&provider=microsoft-outlook-calendar/,
      ),
      // exact: true defends against future "Connect Microsoft Outlook
      // Calendar Foo" sibling providers from breaking this selector
      // the same way Slice 7 Commit 2 broke Slice 6's selector.
      page
        .getByRole("button", {
          name: "Connect Microsoft Outlook Calendar",
          exact: true,
        })
        .click(),
    ]);

    // After OAuth: the integrations page shows a connected row.
    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // DB assertions: integration row exists with encrypted tokens.
    const integrations = await getIntegrationsForUser(
      user.id,
      "microsoft-outlook-calendar",
    );
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]! as Record<string, unknown>;
    expect(integration.provider_account_id).toBe("alice@e2e.test");
    expect(integration.access_token_encrypted).toBeTruthy();
    // Encryption invariant: ciphertext must NOT equal plaintext mock value.
    expect(integration.access_token_encrypted).not.toBe("ms-mock-e2e-access");
    expect(integration.refresh_token_encrypted).toBeTruthy();
    expect(integration.refresh_token_encrypted).not.toBe(
      "ms-mock-e2e-refresh",
    );
    // Scopes: granted set echoed by the mock — must include offline_access
    // + Calendars.ReadWrite (and crucially NOT Mail.* which belongs to the
    // sibling Outlook mail provider).
    const scopes = integration.scopes as readonly string[];
    expect(scopes).toEqual(
      expect.arrayContaining(["offline_access", "Calendars.ReadWrite"]),
    );
    expect(scopes).not.toContain("Mail.Send");
    expect(scopes).not.toContain("Mail.Read");

    // OAuth state row was atomically consumed — total count back to baseline.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // Mock-call assertions: authorize + token exchange + /me lookup.
    const callsAfterOAuth = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.me).toHaveLength(1);
    expect(callsAfterOAuth.calls.subscriptionsCreate).toHaveLength(0);
    expect(callsAfterOAuth.calls.eventsCreate).toHaveLength(0);

    // Authorize redirect_uri proves the dispatcher built the
    // calendar-specific callback URL (not the mail one).
    expect(callsAfterOAuth.calls.authorize[0]!.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/microsoft-outlook-calendar\/callback$/,
    );
    // Authorize scope: exactly the Slice 7 scopes.
    expect(callsAfterOAuth.calls.authorize[0]!.scope).toBe(
      "offline_access Calendars.ReadWrite",
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

    // /me was called with the mock-issued access token.
    expect(callsAfterOAuth.calls.me[0]!.authorization).toBe(
      "Bearer ms-mock-e2e-access",
    );
    expect(callsAfterOAuth.calls.me[0]!.url).toContain(
      "$select=mail,userPrincipalName,id",
    );

    // ── 4. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page.getByLabel(/workflow name/i).fill(
      "E2E Outlook Calendar Walkthrough",
    );
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 5. Configure trigger + action via API patch ──
    // Action is `create_event` so the journey exercises POST /me/events
    // (the simplest action that doesn't require a pre-existing event id).
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "microsoft-outlook-calendar",
          type: "event_changed",
          // Slice 7 emits one event per notification; no per-trigger
          // filter fields.
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "microsoft-outlook-calendar",
          type: "create_event",
          // Hardcoded payload — Q11 schema requires isAllDay +
          // responseRequested with no hidden defaults.
          config: {
            subject: "Echo from Outlook Calendar trigger",
            start: {
              dateTime: "2026-06-01T15:00:00",
              timeZone: "America/New_York",
            },
            end: {
              dateTime: "2026-06-01T15:30:00",
              timeZone: "America/New_York",
            },
            isAllDay: false,
            responseRequested: false,
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

    // Reload so the server-rendered builder picks up the patched definition.
    await page.reload();
    const nodeList = page.locator('ol[aria-label="Workflow nodes"]');
    await expect(nodeList.getByText(/trigger/i).first()).toBeVisible();
    await expect(nodeList.getByText(/action/i).first()).toBeVisible();

    // ── 6. Activate workflow via UI ──
    // Triggers Calendar's activate hook: generates clientState, calculates
    // +4230-min expiration, POSTs /subscriptions with /me/events resource +
    // created,updated,deleted changeType. The mock validates by POSTing
    // back to V2's webhook URL with ?validationToken=…; V2's route echoes
    // it as text/plain. If validation fails, the POST returns 400 and
    // activate aborts with TRIGGER_REGISTRATION_FAILED.
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
    expect(triggerAfterActivate.provider).toBe("microsoft-outlook-calendar");
    expect(triggerAfterActivate.event_type).toBe("event_changed");
    const configAfterActivate = triggerAfterActivate.config as {
      type?: string;
      webhookEnabled?: boolean;
      resource?: string;
      changeType?: string;
      subscriptionId?: string;
      clientState?: string;
      expiresAt?: string;
    };
    expect(configAfterActivate.type).toBe("subscription-watch");
    expect(configAfterActivate.webhookEnabled).toBe(true);
    expect(configAfterActivate.resource).toBe("/me/events");
    expect(configAfterActivate.changeType).toBe("created,updated,deleted");
    expect(configAfterActivate.subscriptionId).toBeTruthy();
    // 32 random bytes → 64 hex chars.
    expect(configAfterActivate.clientState).toMatch(/^[0-9a-f]{64}$/);
    expect(configAfterActivate.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(configAfterActivate.expiresAt!).getTime()).toBeGreaterThan(
      Date.now(),
    );

    // Mock saw exactly one subscriptionsCreate call AND validation matched.
    const callsAfterActivate = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.subscriptionsCreate).toHaveLength(1);
    const createCall = callsAfterActivate.calls.subscriptionsCreate[0]!;
    expect(createCall.responseSubscriptionId).toBe(
      configAfterActivate.subscriptionId,
    );
    expect(createCall.validationStatus).toBe(200);
    expect(createCall.validationEchoMatched).toBe(true);
    // Subscription request body: notificationUrl + lifecycle URL +
    // clientState + resource + changeType + expirationDateTime — and they
    // must point at the calendar route, not the mail route.
    expect(createCall.body.notificationUrl).toBe(
      `${mock.appBaseUrl}/api/webhooks/microsoft-outlook-calendar`,
    );
    expect(createCall.body.lifecycleNotificationUrl).toBe(
      `${mock.appBaseUrl}/api/webhooks/microsoft-outlook-calendar/lifecycle`,
    );
    expect(createCall.body.clientState).toBe(configAfterActivate.clientState);
    expect(createCall.body.resource).toBe("/me/events");
    expect(createCall.body.changeType).toBe("created,updated,deleted");
    expect(createCall.body.expirationDateTime).toBe(
      configAfterActivate.expiresAt,
    );

    // ── 7a. Spoofed-clientState rejection ──
    // Inject a Graph event so the receiver wouldn't 404 if it got past the
    // clientState gate; then send a notification with a deliberately wrong
    // clientState. Per the V2 contract, the route returns 200 (never 401)
    // so probing isn't trivially easy, but the dispatcher MUST NOT enqueue
    // a workflow_run and the calendar action must NOT fire.
    const spoofedEventId = `AAMkAGI2-spoof-${randomUUID()}`;
    await injectEvent(page, mock.baseUrl, spoofedEventId);
    const spoofResp = await page.request.post(
      `${mock.baseUrl}/__sendNotification`,
      {
        data: {
          eventId: spoofedEventId,
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
    // eventsGet must NOT have been called (clientState gate runs before it).
    expect(callsAfterSpoof.calls.eventsGet).toHaveLength(0);
    // No spurious eventsCreate either.
    expect(callsAfterSpoof.calls.eventsCreate).toHaveLength(0);

    // ── 7b. Inject the legitimate event and dispatch a notification ──
    await injectEvent(page, mock.baseUrl, eventId);
    const notifyResp = await page.request.post(
      `${mock.baseUrl}/__sendNotification`,
      { data: { eventId, changeType: "created" } },
    );
    expect(notifyResp.status()).toBe(200);
    const notifyBody = (await notifyResp.json()) as {
      status: number;
      body: string;
    };
    expect(notifyBody.status).toBe(200);

    // ── 8. Wait for workflow_run → assert succeeded ──
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

    // ── 9. Mock saw exactly the expected Graph calls ──
    const callsAfterNotify = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterNotify.calls.eventsGet).toHaveLength(1);
    expect(callsAfterNotify.calls.eventsGet[0]!.eventId).toBe(eventId);
    expect(callsAfterNotify.calls.eventsGet[0]!.authorization).toBe(
      "Bearer ms-mock-e2e-access",
    );
    // create_event fired exactly once with the action's hardcoded payload.
    expect(callsAfterNotify.calls.eventsCreate).toHaveLength(1);
    const createEventCall = callsAfterNotify.calls.eventsCreate[0]!;
    expect(createEventCall.authorization).toBe("Bearer ms-mock-e2e-access");
    expect(createEventCall.body).toEqual(
      expect.objectContaining({
        subject: "Echo from Outlook Calendar trigger",
        isAllDay: false,
        responseRequested: false,
        start: {
          dateTime: "2026-06-01T15:00:00",
          timeZone: "America/New_York",
        },
        end: {
          dateTime: "2026-06-01T15:30:00",
          timeZone: "America/New_York",
        },
      }),
    );

    // ── 10. Dedup row written ──
    // eventId = ${subscriptionId}:${eventId}:${changeType}
    const dedupEventId = `${configAfterActivate.subscriptionId}:${eventId}:created`;
    const dedupRow = await getDedupRow(
      "microsoft-outlook-calendar",
      dedupEventId,
    );
    expect(dedupRow).not.toBeNull();

    // ── 11. UI: Run history shows the succeeded run ──
    await page.reload();
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i)).toBeVisible();

    // ── 12. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ── 13. Dedup probe: send the SAME notification a second time ──
    // webhook_event_dedup catches the duplicate at the dispatcher layer.
    // eventsGet IS called again (the dedup gate is downstream of normalize)
    // but eventsCreate must NOT fire a second time and no second
    // workflow run should appear.
    const notifyResp2 = await page.request.post(
      `${mock.baseUrl}/__sendNotification`,
      { data: { eventId, changeType: "created" } },
    );
    expect(notifyResp2.status()).toBe(200);

    // Give the engine a moment to NOT execute a second run.
    await new Promise((r) => setTimeout(r, 1500));

    const runsAfterReplay = await getWorkflowRunsForUser(user.id);
    expect(runsAfterReplay).toHaveLength(1);

    const callsAfterReplay = await fetchMockCalls(request, mock.baseUrl);
    // eventsGet fired again on the second notification (2 total).
    expect(callsAfterReplay.calls.eventsGet).toHaveLength(2);
    // eventsCreate count stayed at 1 — the load-bearing assertion that
    // the action did NOT double-fire.
    expect(callsAfterReplay.calls.eventsCreate).toHaveLength(1);
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

async function injectEvent(
  page: Page,
  mockBaseUrl: string,
  id: string,
): Promise<void> {
  const resp = await page.request.post(`${mockBaseUrl}/__injectEvent`, {
    data: {
      id,
      subject: "Quarterly review",
      start: { dateTime: "2026-06-01T14:00:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-06-01T15:00:00", timeZone: "America/New_York" },
      isAllDay: false,
      location: { displayName: "Conference Room A" },
      organizer: {
        emailAddress: { name: "Bob", address: "bob@e2e.test" },
      },
      attendees: [
        {
          emailAddress: { name: "Alice", address: "alice@e2e.test" },
          type: "required",
        },
      ],
      body: { contentType: "text", content: "Q2 review" },
      isOnlineMeeting: false,
      webLink: "https://outlook.office.com/calendar/?ItemID=" + id,
      createdDateTime: "2026-05-09T10:00:00Z",
      lastModifiedDateTime: "2026-05-09T10:30:00Z",
      importance: "normal",
      sensitivity: "normal",
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
    sendMail: {
      authorization: string | undefined;
      body: Record<string, unknown>;
    }[];
    getMessage: {
      authorization: string | undefined;
      url: string;
      messageId: string;
    }[];
    eventsCreate: {
      authorization: string | undefined;
      body: Record<string, unknown>;
      responseEventId: string;
    }[];
    eventsGet: {
      authorization: string | undefined;
      url: string;
      eventId: string;
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
  messageIds: string[];
  eventIds: string[];
}

async function fetchMockCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<MockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as MockInspect;
}
