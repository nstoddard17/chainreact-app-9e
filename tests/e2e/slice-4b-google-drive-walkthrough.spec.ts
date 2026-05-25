import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { buildChannelToken } from "@/integrations/_shared/google/channelToken";
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
 * Slice 4b end-to-end walkthrough — Google Drive watch-based push trigger.
 *
 * Mirrors Slice 1 (Slack), Slice 2f (Gmail), and Slice 3b (Calendar).
 * Real auth, real OAuth dispatcher, real integration row with AES-encrypted
 * tokens, real workflow create + activate, real activation hook that
 * captures startPageToken + creates the watch, real webhook receive route
 * at /api/webhooks/google-drive with HMAC channel token verification, real
 * pull → normalize → dispatch → engine → action.
 *
 * Real surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in)
 *   - OAuth dispatcher (`/api/integrations/oauth/[provider]/{connect,callback}`)
 *     for `google-drive` — same dynamic route Calendar uses; PKCE state
 *     row + atomic consume
 *   - Token endpoint POST (form-urlencoded + code_verifier)
 *   - OIDC userinfo lookup at /v1/userinfo for the accountId resolution
 *   - Service-role integration insert + token encryption (AES-256-GCM)
 *   - Workflow CRUD + active-lifecycle transition
 *   - Activation hook seam — registerWorkflowTriggers consults
 *     activationRegistry, calls Drive's activate, which calls
 *     changes.getStartPageToken THEN files.watch.
 *   - Watch metadata persisted to trigger_resources.config
 *     (type=subscription-watch, channelId, resourceId, pageToken,
 *     fileId, expiresAt)
 *   - /api/webhooks/google-drive — header parsing, channelId lookup in
 *     trigger_resources, HMAC channel-token verify, pull(), normalize(),
 *     dispatchTriggerEvent
 *   - DB-backed dedup via webhook_event_dedup
 *   - Engine + canonical resolver + Drive create_folder handler
 *   - refreshAndRetry token decryption on the principal files.create call
 *
 * Mocked surfaces (Google network boundary only):
 *   - accounts.google.com/o/oauth2/v2/auth → 302 to V2's google-drive
 *     callback (mock honors redirect_uri)
 *   - oauth2.googleapis.com/token → canned access + refresh token
 *   - openidconnect.googleapis.com/v1/userinfo → email + sub
 *   - drive/v3/files/{fileId}/watch  (POST — files.watch)
 *   - drive/v3/changes/startPageToken (GET)
 *   - drive/v3/changes               (GET — changes.list)
 *   - drive/v3/files                 (POST — files.create, the action)
 *
 * UI shortcut: V2's builder UI doesn't have per-node configuration yet
 * (Slice 1I.2 was minimum picker + list + save). The test patches the
 * workflow draft via the API at step "configure nodes" so the trigger
 * (file_changed) and action (create_folder) have valid `type` + `config`
 * for execution. Same shortcut Slack/Gmail/Calendar specs use.
 *
 * Two-run stability: every test run uses a fresh per-run drive fileId
 * (`drv-e2e-${randomUUID()}`) AND a fresh occurredAt timestamp so the
 * webhook_event_dedup row written on the first run never collides with
 * the second run. All other tables are cleaned via deleteTestUser's FK
 * cascade.
 */

let testUser: TestUser | null = null;

test.describe("Slice 4b — full Google Drive walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Drive → build + activate → push notification → succeeded run → dedup blocks duplicate", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readGoogleMockState();

    // Per-run unique fileId + change time so the webhook_event_dedup row
    // never collides across consecutive runs (the table is system-wide;
    // user delete doesn't cascade to it — same caveat as Gmail/Calendar).
    const driveFileId = `drv-e2e-${randomUUID()}`;
    const driveChangeTime = new Date().toISOString();

    // Reset mock counters + Gmail/Calendar/Drive state so per-test
    // assertions are scoped to this run.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect Google Drive (UI → mocked authorize → V2 callback → land) ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=google-drive/),
      page.getByRole("button", { name: "Connect Google Drive" }).click(),
    ]);

    // After OAuth: navigate to integrations page; the Drive row shows connected.
    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // DB assertions: integration row exists with encrypted tokens.
    const integrations = await getIntegrationsForUser(user.id, "google-drive");
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]! as Record<string, unknown>;
    expect(integration.provider_account_id).toBe("alice@e2e.test");
    expect(integration.access_token_encrypted).toBeTruthy();
    // Encryption invariant: ciphertext must NOT equal plaintext mock value.
    expect(integration.access_token_encrypted).not.toBe("ya29.mock-e2e-access");
    expect(integration.refresh_token_encrypted).toBeTruthy();
    expect(integration.refresh_token_encrypted).not.toBe("1//mock-e2e-refresh");
    // Scopes: the granted set echoed by the mock — should include both.
    const scopes = integration.scopes as readonly string[];
    expect(scopes).toEqual(
      expect.arrayContaining([
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/userinfo.email",
      ]),
    );

    // OAuth state row was atomically consumed — total count back to baseline.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // Mock-call assertions: exactly one authorize, one token exchange, one
    // userinfo lookup. No Drive API calls yet.
    const callsAfterOAuth = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.userinfo).toHaveLength(1);
    expect(callsAfterOAuth.calls.driveFilesWatch).toHaveLength(0);
    expect(callsAfterOAuth.calls.driveChangesGetStartPageToken).toHaveLength(0);
    expect(callsAfterOAuth.calls.driveChangesList).toHaveLength(0);
    expect(callsAfterOAuth.calls.driveFilesCreate).toHaveLength(0);
    // Token exchange used PKCE: code_verifier was sent.
    expect(
      callsAfterOAuth.calls.tokenExchange[0]!.parsedBody.code_verifier,
    ).toBeTruthy();
    // Authorize redirect_uri was Drive's callback (proves the dispatcher
    // built the right per-provider URL and the mock honored it).
    expect(callsAfterOAuth.calls.authorize[0]!.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/google-drive\/callback$/,
    );

    // ── 4. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page.getByLabel(/workflow name/i).fill("E2E Drive Walkthrough");
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
          provider: "google-drive",
          type: "file_changed",
          // Empty config → activate stores fileId="root" (Slice 4 confirmed
          // root-watch invariant). The watch covers the user's whole drive;
          // pull surfaces every change in the changes feed.
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "google-drive",
          type: "create_folder",
          // Hardcoded folder name — variable resolution from the trigger
          // event is unit-tested elsewhere; this e2e exercises the
          // push → pull → dispatch → handler chain, not variable plumbing.
          // No parentFolderId → folder lands at My Drive root.
          config: {
            name: "Echo from e2e",
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
    // activationRegistry, calls Drive's activate, which calls
    // changes.getStartPageToken (mock returns "page-100000") THEN
    // files.watch (mock returns canned id/resourceId/expiration).
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
    expect(triggerAfterActivate.provider).toBe("google-drive");
    expect(triggerAfterActivate.event_type).toBe("file_changed");
    const configAfterActivate = triggerAfterActivate.config as {
      type?: string;
      webhookEnabled?: boolean;
      fileId?: string;
      channelId?: string;
      resourceId?: string;
      pageToken?: string;
      expiresAt?: string;
    };
    expect(configAfterActivate.type).toBe("subscription-watch");
    expect(configAfterActivate.webhookEnabled).toBe(true);
    // Root-watch invariant — Slice 4 stores the literal "root" string so
    // renewal can re-watch the same target unambiguously.
    expect(configAfterActivate.fileId).toBe("root");
    // ChannelId is `chainreact-{nodeId}-{uuid}` — verify the prefix shape.
    expect(configAfterActivate.channelId).toMatch(
      /^chainreact-trigger-node-[0-9a-f-]+$/,
    );
    expect(configAfterActivate.resourceId).toBe(
      `mock-drive-resource-${configAfterActivate.channelId}`,
    );
    // pageToken from the mock's startPageToken — seed value.
    expect(configAfterActivate.pageToken).toBe("page-100000");
    // expiresAt is an ISO timestamp in the future.
    expect(configAfterActivate.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(configAfterActivate.expiresAt!).getTime()).toBeGreaterThan(
      Date.now(),
    );

    // Mock saw exactly one changes.getStartPageToken and one files.watch.
    // No changes.list yet (no notification yet), no files.create yet.
    const callsAfterActivate = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.driveChangesGetStartPageToken).toHaveLength(
      1,
    );
    expect(callsAfterActivate.calls.driveFilesWatch).toHaveLength(1);
    expect(callsAfterActivate.calls.driveFilesWatch[0]!.fileId).toBe("root");
    expect(
      callsAfterActivate.calls.driveFilesWatch[0]!.body.address,
    ).toBe(`${mock.appBaseUrl}/api/webhooks/google-drive`);
    expect(callsAfterActivate.calls.driveChangesList).toHaveLength(0);
    expect(callsAfterActivate.calls.driveFilesCreate).toHaveLength(0);

    // ── 7. Inject a Drive change via the mock control plane ──
    // Bumps mock currentDrivePageToken from "page-100000" to "page-100001"
    // and queues a delta entry for the next changes.list?pageToken=… call.
    const injectResp = await page.request.post(
      `${mock.baseUrl}/__injectDriveChange`,
      {
        data: {
          // Full Drive change-entry shape — what changes.list returns in
          // `changes[]`. createdTime==modifiedTime triggers normalize's
          // "created" change kind classification.
          kind: "drive#change",
          changeType: "file",
          time: driveChangeTime,
          removed: false,
          fileId: driveFileId,
          file: {
            id: driveFileId,
            name: "report.pdf",
            mimeType: "application/pdf",
            parents: ["root"],
            createdTime: driveChangeTime,
            modifiedTime: driveChangeTime,
            trashed: false,
            webViewLink: `https://drive.google.com/file/d/${driveFileId}`,
          },
        },
      },
    );
    expect(injectResp.status()).toBe(200);

    // ── 8. POST a Google Drive push notification to V2 ──
    // Hand-crafted POST mirrors the X-Goog-* headers Google sends on a
    // resource_state change. Channel token recomputed via buildChannelToken
    // (HMAC-SHA256 over channelId, keyed on WATCH_CHANNEL_SECRET — same
    // secret the dev server's verifyChannelToken validates against).
    const channelId = configAfterActivate.channelId!;
    const channelToken = buildChannelToken({ channelId });
    const webhookResp = await request.post(
      "/api/webhooks/google-drive",
      {
        headers: {
          "x-goog-channel-id": channelId,
          "x-goog-channel-token": channelToken,
          "x-goog-resource-id": configAfterActivate.resourceId!,
          // Drive's granular state. Slice 4's receive route routes ALL
          // non-`sync` states through pull — `add` is representative of a
          // genuine new-file notification.
          "x-goog-resource-state": "add",
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

    // ── 10. Mock saw exactly the expected Drive calls ──
    const callsAfterWebhook = await fetchMockCalls(request, mock.baseUrl);
    // changes.list called once with the activation cursor as pageToken.
    expect(callsAfterWebhook.calls.driveChangesList).toHaveLength(1);
    expect(callsAfterWebhook.calls.driveChangesList[0]!.pageToken).toBe(
      "page-100000",
    );
    // files.create called exactly once with the action's hardcoded folder name.
    expect(callsAfterWebhook.calls.driveFilesCreate).toHaveLength(1);
    const insert = callsAfterWebhook.calls.driveFilesCreate[0]!;
    expect(insert.body.name).toBe("Echo from e2e");
    expect(insert.body.mimeType).toBe(
      "application/vnd.google-apps.folder",
    );
    // No parents array set — schema makes parentFolderId optional, omitted
    // here means folder lands at My Drive root.
    expect(insert.body.parents).toBeUndefined();
    // Authorization header carries the (decrypted) access token — proves
    // the encryption round-trip + refreshAndRetry plumbing.
    expect(insert.authorization).toBe("Bearer ya29.mock-e2e-access");
    // supportsAllDrives forwarded for shared-drive future-proofing.
    expect(insert.url).toContain("supportsAllDrives=true");

    // ── 11. trigger_resources cursor advanced + dedup row written ──
    const triggerRowsAfterWebhook = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterWebhook).toHaveLength(1);
    const triggerAfterWebhook = triggerRowsAfterWebhook[0]! as Record<
      string,
      unknown
    >;
    const configAfterWebhook = triggerAfterWebhook.config as {
      pageToken?: string;
    };
    expect(configAfterWebhook.pageToken).toBe("page-100001");

    // Dedup row written under (provider='google-drive', event_id=`{fileId}:{change.time}`).
    const dedupEventId = `${driveFileId}:${driveChangeTime}`;
    const dedupRow = await getDedupRow("google-drive", dedupEventId);
    expect(dedupRow).not.toBeNull();

    // ── 12. UI: Run history shows the succeeded run ──
    await page.reload();
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i)).toBeVisible();

    // ── 13. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ── 14. Dedup probe — replay same push ──
    // /__replayLastDriveChange re-queues the same change resource at its
    // ORIGINAL pageTokenAtInsert ("page-100001") without bumping the
    // cursor. V2's stored pageToken is also "page-100001" after the first
    // pull, and the mock's drain semantics (>= request token) surface the
    // re-queued entry on changes.list?pageToken=page-100001. normalize
    // produces the SAME eventId (fileId + same change.time) so dispatch
    // hits webhook_event_dedup and skips the enqueue.
    await page.request.post(`${mock.baseUrl}/__replayLastDriveChange`);
    const webhookResp2 = await request.post(
      "/api/webhooks/google-drive",
      {
        headers: {
          "x-goog-channel-id": channelId,
          "x-goog-channel-token": channelToken,
          "x-goog-resource-id": configAfterActivate.resourceId!,
          "x-goog-resource-state": "update",
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
    // The second webhook DID hit changes.list (pull always runs on a real
    // notification). But files.create MUST NOT have fired twice — either
    // dedup blocked it (the load-bearing assertion), or the change was
    // filtered out. Either way, no duplicate side effect.
    expect(callsAfterReplay.calls.driveChangesList.length).toBeGreaterThanOrEqual(
      2,
    );
    expect(callsAfterReplay.calls.driveFilesCreate).toHaveLength(1);
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
    profile: unknown[];
    historyList: unknown[];
    messagesGet: unknown[];
    send: unknown[];
    userinfo: { authorization: string | undefined }[];
    calendarEventsList: unknown[];
    calendarEventsWatch: unknown[];
    calendarEventsInsert: unknown[];
    driveFilesWatch: {
      authorization: string | undefined;
      fileId: string;
      body: Record<string, unknown>;
      responseChannelId: string;
      responseResourceId: string;
    }[];
    driveChangesGetStartPageToken: {
      authorization: string | undefined;
      responseStartPageToken: string;
    }[];
    driveChangesList: {
      authorization: string | undefined;
      url: string;
      pageToken: string | null;
      responseChanges: number;
      responseNewStartPageToken: string | null;
      responseNextPageToken: string | null;
    }[];
    driveFilesCreate: {
      authorization: string | undefined;
      url: string;
      body: Record<string, unknown>;
    }[];
  };
  currentDrivePageToken: string;
}

async function fetchMockCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<MockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as MockInspect;
}
