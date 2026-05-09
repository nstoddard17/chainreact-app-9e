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
 * Slice 8 end-to-end walkthrough — Microsoft OneDrive.
 *
 * Mirrors Slice 6 (Outlook Mail) + Slice 7 (Outlook Calendar) shape.
 * Differences:
 *   - Provider id `microsoft-onedrive`, sibling integration row.
 *   - Subscription on `/me/drive/root` with `changeType: "updated"`
 *     (the only changeType Graph supports for drive subscriptions —
 *     newly-created items surface as updates to the parent folder).
 *   - Trigger `file_changed`. No per-trigger filter fields (one event
 *     per detected change, intentionally narrower than V1's
 *     folder/kind/file-type filters).
 *   - Activation captures a baseline delta cursor BEFORE creating the
 *     subscription. Without it, the first delta-fallback notification
 *     would re-emit every file in the drive (Slice 8 plan §"file_changed
 *     trigger algorithm" — activate step 3).
 *   - Action `create_folder` exercises POST `/v1.0/me/drive/root/children`
 *     (parentItemId omitted → drive root). Slice 8 wraps this with
 *     `@microsoft.graph.conflictBehavior: "fail"` (Q11 — no silent
 *     overwrite or rename).
 *   - Webhook receiver: id-fetch branch — when `resourceData.id` is set
 *     and not the literal "root", GET `/v1.0/me/drive/items/{id}`. The
 *     delta-fallback branch (covered by unit tests, not this e2e)
 *     handles `id === "root"` / empty by walking the persisted delta
 *     cursor.
 *   - Dedup key: `${subscriptionId}:${itemId}:${lastModifiedDateTime}`.
 *     `lastModifiedDateTime` discriminates per-version so successive
 *     edits to the same file each fire as distinct events.
 *
 * Real surfaces exercised:
 *   - Auth, OAuth dispatcher / state / PKCE, token encryption,
 *     integration row writeback, /me lookup.
 *   - Workflow create + activate; activation triggers OneDrive's
 *     activate hook → baseline delta walk (`driveRootDelta` with no
 *     nextLink), 32-byte hex clientState, 4230-min expiration, POST
 *     /subscriptions w/ resource=/me/drive/root & changeType=updated.
 *   - Validation handshake (mock POSTs ?validationToken=…; V2's route
 *     echoes verbatim text/plain).
 *   - Webhook route: subscription lookup, clientState verify,
 *     id-fetch branch via driveItemsGet, normalize, dispatch, dedup.
 *   - Engine + canonical resolver + create_folder handler (Q11
 *     conflictBehavior=fail invariant).
 *
 * Mocked surfaces (Microsoft network boundary only):
 *   - login.microsoftonline.com /common/oauth2/v2.0/{authorize,token}
 *   - graph.microsoft.com /v1.0/me, /v1.0/subscriptions{,/id},
 *     /v1.0/me/drive/root/delta, /v1.0/me/drive/items/{id} (GET),
 *     /v1.0/me/drive/root/children (POST).
 *
 * OneDrive-specific assertions vs Slice 7 calendar:
 *   - changeType is the single `updated` (not the consolidated
 *     `created,updated,deleted`).
 *   - Subscription resource is `/me/drive/root`.
 *   - Activation walked the delta endpoint BEFORE creating the
 *     subscription (driveRootDelta count = 1, mode = "baseline",
 *     happens before subscriptionsCreate's validation handshake).
 *   - trigger_resources.config carries a non-empty `deltaToken`
 *     (the synthetic delta cursor URL the mock returned).
 *   - Spoofed-clientState path: webhook returns 200 (per the V2
 *     contract — never throw on mismatch to avoid probing exposure)
 *     but does NOT enqueue a workflow_run. driveItemsGet is NOT
 *     called (clientState gate runs before pull).
 *   - Action call is driveRootChildrenCreate (POST
 *     /me/drive/root/children with `@microsoft.graph.conflictBehavior:
 *     "fail"`), NOT eventsCreate or sendMail.
 *
 * Dedup probe: same subscriptionId + itemId + lastModifiedDateTime
 * emits twice. Second delivery is caught by webhook_event_dedup at the
 * dispatcher layer → no duplicate run, no duplicate
 * driveRootChildrenCreate call. driveItemsGet IS called twice (the
 * dedup gate is downstream of normalize).
 */

let testUser: TestUser | null = null;

test.describe("Slice 8 — full Microsoft OneDrive walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect OneDrive → build + activate (baselines delta) → notification → succeeded run → spoofed-clientState rejected → duplicate notification dedups", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMicrosoftMockState();

    // Per-run unique itemId so webhook_event_dedup never collides across
    // consecutive runs. Same caveat as Slice 6 + 7 — the mock resets
    // its subscription counter on /__reset; webhook_event_dedup is
    // system-wide and doesn't cascade with deleteTestUser.
    const itemId = `01ABCDEF-onedrive-e2e-${randomUUID()}`;
    // lastModifiedDateTime is part of the dedup key; it must be stable
    // between the first notification and the dedup-probe replay so the
    // second one actually dedups. Per-run uniqueness comes from itemId
    // (randomUUID), so a fixed value here is fine.
    const lastModifiedDateTime = "2026-05-09T10:30:00Z";
    // Reset mock counters + Microsoft state.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect Microsoft OneDrive ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(
        /\/\?integration=connected&provider=microsoft-onedrive/,
      ),
      // exact: true defends against a future "Connect Microsoft OneDrive
      // for Business" sibling provider from breaking this selector the
      // same way Slice 7 Commit 2 broke Slice 6's selector.
      page
        .getByRole("button", {
          name: "Connect Microsoft OneDrive",
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
      "microsoft-onedrive",
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
    // + Files.ReadWrite (and crucially NOT Mail.* / Calendars.* which
    // belong to the sibling Outlook mail / calendar providers).
    const scopes = integration.scopes as readonly string[];
    expect(scopes).toEqual(
      expect.arrayContaining(["offline_access", "Files.ReadWrite"]),
    );
    expect(scopes).not.toContain("Mail.Send");
    expect(scopes).not.toContain("Mail.Read");
    expect(scopes).not.toContain("Calendars.ReadWrite");

    // OAuth state row was atomically consumed — total count back to baseline.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // Mock-call assertions: authorize + token exchange + /me lookup.
    const callsAfterOAuth = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.me).toHaveLength(1);
    expect(callsAfterOAuth.calls.subscriptionsCreate).toHaveLength(0);
    expect(callsAfterOAuth.calls.driveRootDelta).toHaveLength(0);
    expect(callsAfterOAuth.calls.driveRootChildrenCreate).toHaveLength(0);

    // Authorize redirect_uri proves the dispatcher built the
    // OneDrive-specific callback URL (not the mail / calendar one).
    expect(callsAfterOAuth.calls.authorize[0]!.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/microsoft-onedrive\/callback$/,
    );
    // Authorize scope: exactly the Slice 8 scopes.
    expect(callsAfterOAuth.calls.authorize[0]!.scope).toBe(
      "offline_access Files.ReadWrite",
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
      "E2E OneDrive Walkthrough",
    );
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 5. Configure trigger + action via API patch ──
    // Action is `create_folder` so the journey exercises POST
    // /me/drive/root/children (the simplest action that doesn't require
    // a pre-existing item id and exercises the Q11
    // conflictBehavior=fail invariant). parentItemId omitted → root.
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "microsoft-onedrive",
          type: "file_changed",
          // Slice 8 emits one event per notification; no per-trigger
          // filter fields.
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "microsoft-onedrive",
          type: "create_folder",
          // Hardcoded folder name — variable resolution from the trigger
          // event is unit-tested elsewhere; this e2e exercises the
          // notification → receive → dispatch → handler chain, not
          // variable plumbing. parentItemId omitted → drive root.
          config: {
            name: "Echo from OneDrive trigger",
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
    // Triggers OneDrive's activate hook: walks /me/drive/root/delta to
    // capture the baseline cursor (driveRootDelta call #1, mode=baseline)
    // BEFORE creating the subscription (Slice 8 plan §"file_changed
    // trigger algorithm" — activate step 3). Then generates clientState,
    // calculates +4230-min expiration, POSTs /subscriptions with
    // /me/drive/root resource + updated changeType. The mock validates
    // by POSTing back to V2's webhook URL with ?validationToken=…; V2's
    // route echoes it as text/plain. If validation fails, the POST
    // returns 400 and activate aborts with TRIGGER_REGISTRATION_FAILED.
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // DB: trigger_resources row stores the subscription metadata +
    // the persisted delta cursor.
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    expect(triggerAfterActivate.provider).toBe("microsoft-onedrive");
    expect(triggerAfterActivate.event_type).toBe("file_changed");
    const configAfterActivate = triggerAfterActivate.config as {
      type?: string;
      webhookEnabled?: boolean;
      resource?: string;
      changeType?: string;
      subscriptionId?: string;
      clientState?: string;
      deltaToken?: string;
      expiresAt?: string;
    };
    expect(configAfterActivate.type).toBe("subscription-watch");
    expect(configAfterActivate.webhookEnabled).toBe(true);
    expect(configAfterActivate.resource).toBe("/me/drive/root");
    expect(configAfterActivate.changeType).toBe("updated");
    expect(configAfterActivate.subscriptionId).toBeTruthy();
    // 32 random bytes → 64 hex chars.
    expect(configAfterActivate.clientState).toMatch(/^[0-9a-f]{64}$/);
    // Baseline cursor was persisted — Slice 8 plan §"first poll miss"
    // bug prevention. Without this, the first delta-fallback
    // notification would re-emit every file in the drive.
    expect(configAfterActivate.deltaToken).toBeTruthy();
    expect(configAfterActivate.deltaToken).toContain(
      "/v1.0/me/drive/root/delta",
    );
    expect(configAfterActivate.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(configAfterActivate.expiresAt!).getTime()).toBeGreaterThan(
      Date.now(),
    );

    // Mock saw the baseline delta walk + exactly one subscriptionsCreate
    // call AND validation matched.
    const callsAfterActivate = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.driveRootDelta).toHaveLength(1);
    expect(callsAfterActivate.calls.driveRootDelta[0]!.mode).toBe("baseline");
    expect(callsAfterActivate.calls.driveRootDelta[0]!.authorization).toBe(
      "Bearer ms-mock-e2e-access",
    );
    expect(callsAfterActivate.calls.subscriptionsCreate).toHaveLength(1);
    const createCall = callsAfterActivate.calls.subscriptionsCreate[0]!;
    expect(createCall.responseSubscriptionId).toBe(
      configAfterActivate.subscriptionId,
    );
    expect(createCall.validationStatus).toBe(200);
    expect(createCall.validationEchoMatched).toBe(true);
    // Subscription request body: notificationUrl + lifecycle URL +
    // clientState + resource + changeType + expirationDateTime — and
    // they must point at the OneDrive route, not the mail / calendar
    // route.
    expect(createCall.body.notificationUrl).toBe(
      `${mock.appBaseUrl}/api/webhooks/microsoft-onedrive`,
    );
    expect(createCall.body.lifecycleNotificationUrl).toBe(
      `${mock.appBaseUrl}/api/webhooks/microsoft-onedrive/lifecycle`,
    );
    expect(createCall.body.clientState).toBe(configAfterActivate.clientState);
    expect(createCall.body.resource).toBe("/me/drive/root");
    expect(createCall.body.changeType).toBe("updated");
    expect(createCall.body.expirationDateTime).toBe(
      configAfterActivate.expiresAt,
    );

    // ── 7a. Spoofed-clientState rejection ──
    // Inject a Graph DriveItem so the receiver wouldn't 404 if it got
    // past the clientState gate; then send a notification with a
    // deliberately wrong clientState. Per the V2 contract, the route
    // returns 200 (never 401) so probing isn't trivially easy, but the
    // dispatcher MUST NOT enqueue a workflow_run and the create_folder
    // action must NOT fire.
    const spoofedItemId = `01ABCDEF-spoof-${randomUUID()}`;
    await injectDriveItem(page, mock.baseUrl, spoofedItemId, lastModifiedDateTime);
    const spoofResp = await page.request.post(
      `${mock.baseUrl}/__sendNotification`,
      {
        data: {
          itemId: spoofedItemId,
          changeType: "updated",
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
    // driveItemsGet must NOT have been called (clientState gate runs
    // before the id-fetch pull).
    expect(callsAfterSpoof.calls.driveItemsGet).toHaveLength(0);
    // No spurious driveRootChildrenCreate either.
    expect(callsAfterSpoof.calls.driveRootChildrenCreate).toHaveLength(0);

    // ── 7b. Inject the legitimate DriveItem and dispatch a notification ──
    await injectDriveItem(page, mock.baseUrl, itemId, lastModifiedDateTime);
    const notifyResp = await page.request.post(
      `${mock.baseUrl}/__sendNotification`,
      { data: { itemId, changeType: "updated" } },
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
    expect(callsAfterNotify.calls.driveItemsGet).toHaveLength(1);
    expect(callsAfterNotify.calls.driveItemsGet[0]!.itemId).toBe(itemId);
    expect(callsAfterNotify.calls.driveItemsGet[0]!.authorization).toBe(
      "Bearer ms-mock-e2e-access",
    );
    // create_folder fired exactly once with the action's hardcoded payload
    // and the Q11 conflictBehavior=fail invariant.
    expect(callsAfterNotify.calls.driveRootChildrenCreate).toHaveLength(1);
    const createFolderCall = callsAfterNotify.calls.driveRootChildrenCreate[0]!;
    expect(createFolderCall.authorization).toBe("Bearer ms-mock-e2e-access");
    expect(createFolderCall.body).toEqual(
      expect.objectContaining({
        name: "Echo from OneDrive trigger",
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    );
    // Delta cursor was NOT walked again on the id-fetch path — only the
    // baseline call from activation.
    expect(callsAfterNotify.calls.driveRootDelta).toHaveLength(1);

    // ── 10. Dedup row written ──
    // eventId = ${subscriptionId}:${itemId}:${lastModifiedDateTime}
    const dedupEventId = `${configAfterActivate.subscriptionId}:${itemId}:${lastModifiedDateTime}`;
    const dedupRow = await getDedupRow("microsoft-onedrive", dedupEventId);
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
    // driveItemsGet IS called again (the dedup gate is downstream of
    // normalize) but driveRootChildrenCreate must NOT fire a second
    // time and no second workflow run should appear.
    const notifyResp2 = await page.request.post(
      `${mock.baseUrl}/__sendNotification`,
      { data: { itemId, changeType: "updated" } },
    );
    expect(notifyResp2.status()).toBe(200);

    // Give the engine a moment to NOT execute a second run.
    await new Promise((r) => setTimeout(r, 1500));

    const runsAfterReplay = await getWorkflowRunsForUser(user.id);
    expect(runsAfterReplay).toHaveLength(1);

    const callsAfterReplay = await fetchMockCalls(request, mock.baseUrl);
    // driveItemsGet fired again on the second notification (2 total).
    expect(callsAfterReplay.calls.driveItemsGet).toHaveLength(2);
    // driveRootChildrenCreate count stayed at 1 — the load-bearing
    // assertion that the action did NOT double-fire.
    expect(callsAfterReplay.calls.driveRootChildrenCreate).toHaveLength(1);
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
 * Inject a OneDrive DriveItem into the mock store so
 * `/v1.0/me/drive/items/{id}` returns it on the receive path's id-fetch
 * branch. `lastModifiedDateTime` is part of the dedup key — must be
 * stable between the first notification and the dedup-probe replay.
 */
async function injectDriveItem(
  page: Page,
  mockBaseUrl: string,
  id: string,
  lastModifiedDateTime: string,
): Promise<void> {
  const resp = await page.request.post(`${mockBaseUrl}/__injectDriveItem`, {
    data: {
      id,
      name: "report-q2.pdf",
      size: 12345,
      file: { mimeType: "application/pdf" },
      webUrl: `https://onedrive.live.com/?id=${id}`,
      "@microsoft.graph.downloadUrl": `https://download.example.com/${id}`,
      parentReference: {
        driveId: "mock-drive-id",
        driveType: "personal",
        id: "root",
        path: "/drive/root:",
      },
      createdDateTime: "2026-05-09T10:00:00Z",
      lastModifiedDateTime,
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
    driveItemsGet: {
      authorization: string | undefined;
      url: string;
      itemId: string;
    }[];
    driveRootDelta: {
      authorization: string | undefined;
      url: string;
      mode: "baseline" | "incremental";
    }[];
    driveRootChildrenCreate: {
      authorization: string | undefined;
      body: Record<string, unknown>;
      responseItemId: string;
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
  driveItemIds: string[];
}

async function fetchMockCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<MockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as MockInspect;
}
