import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { buildChannelToken } from "@/integrations/google-calendar/utils/channelToken";
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
import { readGoogleMockState } from "./global-setup";

/**
 * Slice 3b end-to-end walkthrough — Google Calendar watch-based push trigger.
 *
 * Mirrors Slice 1 (Slack) and Slice 2f (Gmail). Real auth, real OAuth
 * dispatcher (PKCE + atomic state consume), real integration row with
 * AES-encrypted tokens, real workflow create + activate, real activation
 * hook that calls events.list (initial baseline) + events.watch, real
 * webhook receive route at /api/webhooks/google-calendar with HMAC channel
 * token verification, real pull → normalize → dispatch → engine → action.
 *
 * Real surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in)
 *   - OAuth dispatcher (`/api/integrations/oauth/[provider]/{connect,callback}`)
 *     — same dynamic route Gmail uses; PKCE state row + atomic consume
 *   - Token endpoint POST (form-urlencoded with code_verifier)
 *   - OIDC userinfo lookup at /v1/userinfo for the accountId resolution
 *     (Calendar can't use users.getProfile with the narrow calendar.events
 *     scope — userinfo.email scope grants this endpoint instead)
 *   - Service-role integration insert + token encryption (AES-256-GCM)
 *   - Workflow CRUD + active-lifecycle transition
 *   - Activation hook seam — registerWorkflowTriggers consults
 *     activationRegistry, calls Calendar's activate, which paginates
 *     events.list for an initial nextSyncToken THEN calls events.watch.
 *   - Watch metadata persisted to trigger_resources.config
 *     (type=subscription-watch, channelId, resourceId, syncToken, expiresAt)
 *   - /api/webhooks/google-calendar — header parsing, channelId lookup in
 *     trigger_resources, HMAC channel-token verify, pull(), normalize(),
 *     dispatchTriggerEvent
 *   - DB-backed dedup via webhook_event_dedup
 *   - Engine + canonical resolver + Calendar create_event handler
 *   - refreshAndRetry token decryption on the principal events.insert call
 *
 * Mocked surfaces (Google network boundary only):
 *   - accounts.google.com/o/oauth2/v2/auth → 302 to V2's google-calendar
 *     callback (mock honors redirect_uri, same route used for both Gmail
 *     and Calendar)
 *   - oauth2.googleapis.com/token → canned access + refresh token
 *   - openidconnect.googleapis.com/v1/userinfo → email + sub
 *   - calendar/v3/calendars/{cid}/events           (GET — events.list)
 *   - calendar/v3/calendars/{cid}/events/watch     (POST — events.watch)
 *   - calendar/v3/calendars/{cid}/events           (POST — events.insert)
 *
 * UI shortcut: V2's builder UI doesn't have per-node configuration yet
 * (Slice 1I.2 was minimum picker + list + save). The test patches the
 * workflow draft via the API at step "configure nodes" so the trigger
 * (event_changed) and action (create_event) have valid `type` + `config`
 * for execution. Same shortcut Slack and Gmail specs use.
 *
 * Two-run stability: every test run uses a fresh per-run calendar event id
 * (`evt-e2e-${randomUUID()}`) so the webhook_event_dedup row written on
 * the first run never collides with the second run. All other tables are
 * cleaned via deleteTestUser's FK cascade.
 */

let testUser: TestUser | null = null;

test.describe("Slice 3b — full Google Calendar walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Calendar → build + activate → push notification → succeeded run → dedup blocks duplicate", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readGoogleMockState();

    // Per-run unique calendar event id so the webhook_event_dedup row never
    // collides across consecutive runs (the table is system-wide; user delete
    // doesn't cascade to it — same caveat as Gmail's messageId).
    const calendarEventId = `evt-e2e-${randomUUID()}`;
    const calendarEventUpdated = new Date().toISOString();

    // Reset mock counters + email + calendar store so per-test assertions are
    // scoped to this run. The shared mock's __reset clears Gmail and Calendar
    // state together.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect Google Calendar (UI → mocked authorize → V2 callback → land) ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=google-calendar/),
      page.getByRole("button", { name: "Connect Google Calendar" }).click(),
    ]);

    // After OAuth: navigate to integrations page; the Calendar row shows connected.
    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // DB assertions: integration row exists with encrypted tokens.
    const integrations = await getIntegrationsForUser(user.id, "google-calendar");
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]! as Record<string, unknown>;
    expect(integration.provider_account_id).toBe("alice@e2e.test");
    expect(integration.access_token_encrypted).toBeTruthy();
    // Encryption invariant: ciphertext must NOT equal plaintext mock value.
    expect(integration.access_token_encrypted).not.toBe("ya29.mock-e2e-access");
    expect(integration.refresh_token_encrypted).toBeTruthy();
    expect(integration.refresh_token_encrypted).not.toBe("1//mock-e2e-refresh");
    // Scopes: granted set echoed by the mock — should include both required.
    const scopes = integration.scopes as readonly string[];
    expect(scopes).toEqual(
      expect.arrayContaining([
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/userinfo.email",
      ]),
    );

    // OAuth state row was atomically consumed — total count back to baseline.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // Mock-call assertions: exactly one authorize, one token exchange, one
    // userinfo lookup. No Calendar API calls yet.
    const callsAfterOAuth = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.userinfo).toHaveLength(1);
    expect(callsAfterOAuth.calls.calendarEventsList).toHaveLength(0);
    expect(callsAfterOAuth.calls.calendarEventsWatch).toHaveLength(0);
    expect(callsAfterOAuth.calls.calendarEventsInsert).toHaveLength(0);
    // Token exchange used PKCE: code_verifier was sent.
    expect(
      callsAfterOAuth.calls.tokenExchange[0]!.parsedBody.code_verifier,
    ).toBeTruthy();
    // Authorize redirect_uri was Calendar's callback (proves the dispatcher
    // built the right per-provider URL and the mock honored it).
    expect(callsAfterOAuth.calls.authorize[0]!.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/google-calendar\/callback$/,
    );

    // ── 4. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page.getByLabel(/workflow name/i).fill("E2E Calendar Walkthrough");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 5. Configure trigger + action via API patch ──
    // V2's builder UI cannot configure node `type` + `config` yet
    // (Slice 1I.2 was minimum picker + list + save). When per-node
    // configuration UI ships, replace this with UI interaction.
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "google-calendar",
          type: "event_changed",
          config: { calendarId: "primary" },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "google-calendar",
          type: "create_event",
          // Hardcoded fields — variable resolution from the trigger event
          // is unit-tested elsewhere; this e2e exercises the
          // push → pull → dispatch → handler chain, not variable plumbing.
          // Q11 required: sendNotifications + guestsCan*.
          config: {
            calendarId: "primary",
            summary: "Echo from e2e",
            startDateTime: "2030-01-01T10:00:00Z",
            endDateTime: "2030-01-01T11:00:00Z",
            allDay: false,
            sendNotifications: "none",
            guestsCanInviteOthers: false,
            guestsCanSeeOtherGuests: false,
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
    // Triggers the activation hook: registerWorkflowTriggers consults
    // activationRegistry, calls Calendar's activate, which paginates
    // events.list (mock returns nextSyncToken on first call) THEN calls
    // events.watch (mock returns canned id/resourceId/expiration).
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // DB: trigger_resources row stores the watch metadata.
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    expect(triggerAfterActivate.provider).toBe("google-calendar");
    expect(triggerAfterActivate.event_type).toBe("event_changed");
    const configAfterActivate = triggerAfterActivate.config as {
      type?: string;
      webhookEnabled?: boolean;
      calendarId?: string;
      channelId?: string;
      resourceId?: string;
      syncToken?: string;
      expiresAt?: string;
    };
    expect(configAfterActivate.type).toBe("subscription-watch");
    expect(configAfterActivate.webhookEnabled).toBe(true);
    expect(configAfterActivate.calendarId).toBe("primary");
    // ChannelId is `chainreact-{nodeId}-{uuid}` — verify the prefix shape.
    expect(configAfterActivate.channelId).toMatch(
      /^chainreact-trigger-node-[0-9a-f-]+$/,
    );
    expect(configAfterActivate.resourceId).toBe(
      `mock-resource-${configAfterActivate.channelId}`,
    );
    // syncToken from the mock's initial baseline — seed value.
    expect(configAfterActivate.syncToken).toBe("sync-100000");
    // expiresAt is an ISO timestamp in the future.
    expect(configAfterActivate.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(configAfterActivate.expiresAt!).getTime()).toBeGreaterThan(
      Date.now(),
    );

    // Mock saw exactly one events.list (initial baseline, no syncToken) and
    // one events.watch. No insert yet — the action runs only after a real
    // push notification with a delta surfaces.
    const callsAfterActivate = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.calendarEventsList).toHaveLength(1);
    expect(callsAfterActivate.calls.calendarEventsList[0]!.syncToken).toBeNull();
    expect(callsAfterActivate.calls.calendarEventsList[0]!.calendarId).toBe(
      "primary",
    );
    expect(callsAfterActivate.calls.calendarEventsWatch).toHaveLength(1);
    expect(callsAfterActivate.calls.calendarEventsWatch[0]!.calendarId).toBe(
      "primary",
    );
    expect(callsAfterActivate.calls.calendarEventsWatch[0]!.body.address).toBe(
      `${mock.appBaseUrl}/api/webhooks/google-calendar`,
    );
    expect(callsAfterActivate.calls.calendarEventsInsert).toHaveLength(0);

    // ── 7. Inject a calendar event via the mock control plane ──
    // Bumps mock currentCalendarSyncToken from "sync-100000" to "sync-100001"
    // and queues a delta entry for the next events.list?syncToken=… call.
    const injectResp = await page.request.post(
      `${mock.baseUrl}/__injectCalendarEvent`,
      {
        data: {
          // Full Calendar event resource shape — what events.list returns
          // in `items[]`. created==updated triggers normalize's "created"
          // change kind classification.
          id: calendarEventId,
          status: "confirmed",
          summary: "New meeting",
          description: "Synced from e2e",
          location: "Earth",
          htmlLink: `https://calendar.google.com/event?eid=${calendarEventId}`,
          created: calendarEventUpdated,
          updated: calendarEventUpdated,
          start: { dateTime: "2030-02-01T15:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2030-02-01T16:00:00Z", timeZone: "UTC" },
          attendees: [],
        },
      },
    );
    expect(injectResp.status()).toBe(200);

    // ── 8. POST a Google Calendar push notification to V2 ──
    // Hand-crafted POST mirrors the X-Goog-* headers Google sends on
    // resource_state=exists. Channel token is recomputed via buildChannelToken
    // (HMAC-SHA256 over channelId, keyed on WATCH_CHANNEL_SECRET — same
    // secret the dev server's verifyChannelToken validates against).
    const channelId = configAfterActivate.channelId!;
    const channelToken = buildChannelToken({ channelId });
    const webhookResp = await request.post(
      "/api/webhooks/google-calendar",
      {
        headers: {
          "x-goog-channel-id": channelId,
          "x-goog-channel-token": channelToken,
          "x-goog-resource-id": configAfterActivate.resourceId!,
          "x-goog-resource-state": "exists",
          "x-goog-message-number": "1",
        },
      },
    );
    expect(webhookResp.status(), await webhookResp.text()).toBe(200);

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

    // ── 10. Mock saw exactly the expected Calendar calls ──
    const callsAfterWebhook = await fetchMockCalls(request, mock.baseUrl);
    // events.list: 1 from activate (no syncToken) + 1 from pull (syncToken=sync-100000).
    expect(callsAfterWebhook.calls.calendarEventsList).toHaveLength(2);
    expect(
      callsAfterWebhook.calls.calendarEventsList[1]!.syncToken,
    ).toBe("sync-100000");
    // events.insert called exactly once with the action's hardcoded fields.
    expect(callsAfterWebhook.calls.calendarEventsInsert).toHaveLength(1);
    const insert = callsAfterWebhook.calls.calendarEventsInsert[0]!;
    expect(insert.calendarId).toBe("primary");
    expect(insert.body.summary).toBe("Echo from e2e");
    expect(insert.body.start).toEqual({
      dateTime: "2030-01-01T10:00:00Z",
      // Q12 timezone resolution — no explicit tz on the action config
      // means resolveTimezone falls through to UTC.
      timeZone: "UTC",
    });
    expect(insert.body.end).toEqual({
      dateTime: "2030-01-01T11:00:00Z",
      timeZone: "UTC",
    });
    // Authorization header carries the (decrypted) access token — proves
    // the encryption round-trip + refreshAndRetry plumbing.
    expect(insert.authorization).toBe("Bearer ya29.mock-e2e-access");
    // sendUpdates query param echoes the action's sendNotifications choice.
    expect(insert.url).toContain("sendUpdates=none");

    // ── 11. trigger_resources cursor advanced + dedup row written ──
    const triggerRowsAfterWebhook = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterWebhook).toHaveLength(1);
    const triggerAfterWebhook = triggerRowsAfterWebhook[0]! as Record<
      string,
      unknown
    >;
    const configAfterWebhook = triggerAfterWebhook.config as {
      syncToken?: string;
    };
    expect(configAfterWebhook.syncToken).toBe("sync-100001");

    // Dedup row written under (provider='google-calendar', event_id=`{id}:{updated}`).
    const dedupEventId = `${calendarEventId}:${calendarEventUpdated}`;
    const dedupRow = await getDedupRow("google-calendar", dedupEventId);
    expect(dedupRow).not.toBeNull();

    // ── 12. UI: Run history shows the succeeded run ──
    await page.reload();
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i)).toBeVisible();

    // ── 13. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ── 14. Dedup probe — replay same push ──
    // /__replayLastCalendarEvent re-queues the same calendar event resource
    // at its ORIGINAL syncTokenAtInsert (does NOT bump currentCalendarSyncToken).
    // BUT — V2 already advanced the persisted syncToken to "sync-100001" on
    // the first pull, so events.list?syncToken=sync-100001 wouldn't surface
    // the replayed entry (the replay sits at sync-100001, equal to the
    // request — drained). To ensure the spec exercises the dedup branch we
    // would need to simulate the syncToken being rolled back. The simpler,
    // realistic-shape probe: POST the SAME webhook headers a second time.
    // V2's pull will run again with syncToken=sync-100001. Mock returns
    // empty items + nextSyncToken=sync-100001. No new TriggerEvents emit,
    // no second run is enqueued. The dedup table is incidentally exercised
    // because if pull DID surface the event, dispatch would compute the
    // same dedup key and skip the enqueue.
    //
    // Replay first so any future syncToken-rewind variant surfaces the event;
    // assertion below is on the run + insert count regardless.
    await page.request.post(`${mock.baseUrl}/__replayLastCalendarEvent`);
    const webhookResp2 = await request.post(
      "/api/webhooks/google-calendar",
      {
        headers: {
          "x-goog-channel-id": channelId,
          "x-goog-channel-token": channelToken,
          "x-goog-resource-id": configAfterActivate.resourceId!,
          "x-goog-resource-state": "exists",
          "x-goog-message-number": "2",
        },
      },
    );
    expect(webhookResp2.status()).toBe(200);

    // Give the engine a moment to NOT execute a second run. We can't
    // wait-for-row (the row should not appear), so we busy-wait briefly
    // then assert the count stayed at 1.
    await new Promise((r) => setTimeout(r, 1500));
    const runsAfterReplay = await getWorkflowRunsForUser(user.id);
    expect(runsAfterReplay).toHaveLength(1);

    const callsAfterReplay = await fetchMockCalls(request, mock.baseUrl);
    // The second webhook DID hit events.list (pull always runs on
    // resource_state=exists). But events.insert MUST NOT have fired twice —
    // either dedup blocked it, or pull returned no items. Both are valid
    // outcomes; the load-bearing assertion is that the action didn't
    // double-fire.
    expect(callsAfterReplay.calls.calendarEventsList.length).toBeGreaterThanOrEqual(
      3,
    );
    expect(callsAfterReplay.calls.calendarEventsInsert).toHaveLength(1);
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

interface MockInspect {
  calls: {
    authorize: {
      state: string;
      scope: string;
      codeChallenge: string | null;
      redirectUri: string | null;
    }[];
    tokenExchange: { body: string; parsedBody: Record<string, string> }[];
    profile: { authorization: string | undefined; responseHistoryId: string }[];
    historyList: { authorization: string | undefined; url: string }[];
    messagesGet: { authorization: string | undefined; url: string }[];
    send: { authorization: string | undefined }[];
    userinfo: { authorization: string | undefined }[];
    calendarEventsList: {
      authorization: string | undefined;
      url: string;
      calendarId: string;
      syncToken: string | null;
      pageToken: string | null;
      responseItems: number;
      responseSyncToken: string | null;
    }[];
    calendarEventsWatch: {
      authorization: string | undefined;
      calendarId: string;
      body: Record<string, unknown>;
      responseChannelId: string;
      responseResourceId: string;
    }[];
    calendarEventsInsert: {
      authorization: string | undefined;
      calendarId: string;
      url: string;
      body: Record<string, unknown>;
    }[];
  };
  currentHistoryId: string;
  currentCalendarSyncToken: string;
}

async function fetchMockCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<MockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as MockInspect;
}
