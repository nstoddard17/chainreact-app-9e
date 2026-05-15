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
 * Slice 5b end-to-end walkthrough — Google Sheets row_changed push trigger.
 *
 * Mirrors Slice 4b (Drive) and Slice 3b (Calendar). Real auth, real OAuth
 * dispatcher, real integration row with AES-encrypted tokens, real
 * workflow create + activate, real activation hook that snapshots the
 * sheet's row count + captures the Drive baseline cursor + creates the
 * Drive files.watch on the spreadsheet's fileId, real webhook receive
 * route at /api/webhooks/google-sheets with HMAC channel token verify,
 * real pull → normalize → dispatch → engine → action.
 *
 * Real surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in)
 *   - OAuth dispatcher (`/api/integrations/oauth/google-sheets/{connect,callback}`)
 *     — same dynamic route Calendar/Drive use; PKCE state row + atomic
 *     consume
 *   - Token endpoint POST (form-urlencoded + code_verifier)
 *   - OIDC userinfo lookup at /v1/userinfo
 *   - Service-role integration insert + token encryption (AES-256-GCM)
 *   - Workflow CRUD + active-lifecycle transition
 *   - Activation hook seam — registerWorkflowTriggers consults
 *     activationRegistry, calls Sheets' activate, which calls
 *     spreadsheets.values.get (snapshot row count) THEN
 *     changes.getStartPageToken (Drive cursor) THEN files.watch (Drive
 *     watch on the spreadsheet fileId).
 *   - Watch metadata persisted to trigger_resources.config
 *     (type=subscription-watch, channelId, resourceId, pageToken,
 *     spreadsheetId, sheetName, lastRowCount, expiresAt)
 *   - /api/webhooks/google-sheets — header parsing, channelId lookup,
 *     HMAC channel-token verify, pull(), normalize(), dispatchTriggerEvent
 *   - DB-backed dedup via webhook_event_dedup
 *   - Engine + canonical resolver + Sheets append_row handler
 *   - refreshAndRetry token decryption on the principal values.append call
 *
 * Mocked surfaces (Google network boundary only):
 *   - accounts.google.com/o/oauth2/v2/auth → 302 to V2's google-sheets
 *     callback (mock honors redirect_uri)
 *   - oauth2.googleapis.com/token → canned access + refresh token
 *   - openidconnect.googleapis.com/v1/userinfo → email + sub
 *   - drive/v3/files/{fileId}/watch  (Drive transport for Sheets)
 *   - drive/v3/changes/startPageToken (Drive transport for Sheets)
 *   - sheets/v4/spreadsheets/{id}/values/{range}  GET (snapshot + pull)
 *   - sheets/v4/spreadsheets/{id}/values/{range}:append  POST (the action)
 *
 * Dedup-probe semantic for Sheets (different from Drive/Calendar):
 *   Sheets' "dedup" works at V2's row-count baseline — pull only emits
 *   for rowIndex > lastRowCount, and lastRowCount advances after each
 *   successful pull. So POSTing the same webhook twice naturally
 *   produces only ONE workflow_run because the second pull sees
 *   currentRowCount === lastRowCount and emits zero events. This is
 *   distinct from Drive's flow (where dedup blocks at the dispatcher's
 *   webhook_event_dedup table). The spec asserts the OUTCOME (no
 *   duplicate run, no duplicate action call) — the mechanism is
 *   internal.
 *
 * Two-run stability: every test run uses a fresh per-run row value
 * (`alice-${randomUUID()}`) so the webhook_event_dedup row from one
 * run can't collide with the next. All other tables are cleaned via
 * deleteTestUser's FK cascade.
 */

let testUser: TestUser | null = null;

test.describe("Slice 5b — full Google Sheets walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Sheets → build + activate → push notification → succeeded run → second push emits nothing", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readGoogleMockState();

    // Per-run unique row value so webhook_event_dedup never collides
    // across consecutive runs (system-wide table; user delete doesn't
    // cascade — same caveat as Gmail/Calendar/Drive).
    const aliceLabel = `alice-${randomUUID()}`;
    const aliceEmail = `${aliceLabel}@e2e.test`;

    // Reset mock counters + Gmail/Calendar/Drive/Sheets state.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect Google Sheets (UI → mocked authorize → V2 callback → land) ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=google-sheets/),
      page.getByRole("button", { name: "Connect Google Sheets" }).click(),
    ]);

    // After OAuth: navigate back to integrations page; the Sheets row shows connected.
    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // DB assertions: integration row exists with encrypted tokens.
    const integrations = await getIntegrationsForUser(user.id, "google-sheets");
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
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/userinfo.email",
      ]),
    );

    // OAuth state row was atomically consumed — total count back to baseline.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // Mock-call assertions: exactly one authorize, one token exchange, one userinfo.
    const callsAfterOAuth = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.userinfo).toHaveLength(1);
    expect(callsAfterOAuth.calls.driveFilesWatch).toHaveLength(0);
    expect(callsAfterOAuth.calls.sheetsValuesGet).toHaveLength(0);
    expect(callsAfterOAuth.calls.sheetsValuesAppend).toHaveLength(0);
    // Token exchange used PKCE: code_verifier was sent.
    expect(
      callsAfterOAuth.calls.tokenExchange[0]!.parsedBody.code_verifier,
    ).toBeTruthy();
    // Authorize redirect_uri was Sheets' callback (proves the dispatcher
    // built the right per-provider URL and the mock honored it).
    expect(callsAfterOAuth.calls.authorize[0]!.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/google-sheets\/callback$/,
    );

    // ── 4. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page.getByLabel(/workflow name/i).fill("E2E Sheets Walkthrough");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 5. Configure trigger + action via API patch ──
    // V2's builder UI cannot configure node `type` + `config` yet
    // (Slice 1I.2 was minimum picker + list + save). Same shortcut
    // Slack/Gmail/Calendar/Drive specs use.
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "google-sheets",
          type: "row_changed",
          config: {
            spreadsheetId: "ss-e2e-test",
            sheetName: "Sheet1",
            // headerRow defaults to false; spec exercises the no-headers path.
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "google-sheets",
          type: "append_row",
          // Hardcoded values — variable resolution from the trigger event
          // is unit-tested elsewhere; this e2e exercises the
          // push → pull → dispatch → handler chain, not variable plumbing.
          // Q11: valueInputOption is REQUIRED.
          config: {
            spreadsheetId: "ss-e2e-test",
            range: "Sheet2!A:B",
            values: ["echoed-from-trigger", "ok"],
            valueInputOption: "USER_ENTERED",
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
    // Triggers Sheets' activate hook: values.get (snapshot row count, mock
    // returns empty initially → lastRowCount=0) → changes.getStartPageToken
    // (Drive baseline) → files.watch (Drive watch on the spreadsheet fileId).
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // DB: trigger_resources row stores the Sheets-specific config.
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    expect(triggerAfterActivate.provider).toBe("google-sheets");
    expect(triggerAfterActivate.event_type).toBe("row_changed");
    const configAfterActivate = triggerAfterActivate.config as {
      type?: string;
      webhookEnabled?: boolean;
      spreadsheetId?: string;
      sheetName?: string;
      headerRow?: boolean;
      channelId?: string;
      resourceId?: string;
      pageToken?: string;
      lastRowCount?: number;
      expiresAt?: string;
    };
    expect(configAfterActivate.type).toBe("subscription-watch");
    expect(configAfterActivate.webhookEnabled).toBe(true);
    expect(configAfterActivate.spreadsheetId).toBe("ss-e2e-test");
    expect(configAfterActivate.sheetName).toBe("Sheet1");
    expect(configAfterActivate.headerRow).toBe(false);
    // ChannelId is `chainreact-{nodeId}-{uuid}` — verify the prefix shape.
    expect(configAfterActivate.channelId).toMatch(
      /^chainreact-trigger-node-[0-9a-f-]+$/,
    );
    expect(configAfterActivate.resourceId).toBe(
      `mock-drive-resource-${configAfterActivate.channelId}`,
    );
    // Sheet starts empty → lastRowCount = 0 from values.get's initial snapshot.
    expect(configAfterActivate.lastRowCount).toBe(0);
    // Drive baseline cursor captured (kept for future polling parity; pull doesn't use it).
    expect(configAfterActivate.pageToken).toBe("page-100000");
    expect(configAfterActivate.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(configAfterActivate.expiresAt!).getTime()).toBeGreaterThan(
      Date.now(),
    );

    // Mock saw exactly: one values.get (activate snapshot), one
    // changes.getStartPageToken (Drive baseline), one files.watch (Drive
    // watch). No values.append yet (action hasn't run).
    const callsAfterActivate = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.sheetsValuesGet).toHaveLength(1);
    expect(callsAfterActivate.calls.sheetsValuesGet[0]!.spreadsheetId).toBe(
      "ss-e2e-test",
    );
    expect(callsAfterActivate.calls.sheetsValuesGet[0]!.range).toBe(
      "Sheet1!A:Z",
    );
    expect(callsAfterActivate.calls.driveChangesGetStartPageToken).toHaveLength(
      1,
    );
    expect(callsAfterActivate.calls.driveFilesWatch).toHaveLength(1);
    expect(callsAfterActivate.calls.driveFilesWatch[0]!.fileId).toBe(
      "ss-e2e-test",
    );
    expect(callsAfterActivate.calls.driveFilesWatch[0]!.body.address).toBe(
      `${mock.appBaseUrl}/api/webhooks/google-sheets`,
    );
    expect(callsAfterActivate.calls.sheetsValuesAppend).toHaveLength(0);

    // ── 7. Inject a Sheets row via the mock control plane ──
    // Mock's currentSheetsRows now has 1 row. Next values.get returns it.
    const injectResp = await page.request.post(
      `${mock.baseUrl}/__injectSheetRow`,
      { data: { values: [aliceLabel, aliceEmail] } },
    );
    expect(injectResp.status()).toBe(200);

    // ── 8. POST a Google Sheets push notification to V2 ──
    // Hand-crafted POST mirrors the X-Goog-* headers Google sends via
    // Drive's transport (Sheets uses Drive files.watch). Channel token
    // recomputed via buildChannelToken (HMAC-SHA256 over channelId,
    // keyed on WATCH_CHANNEL_SECRET — same secret the dev server's
    // verifyChannelToken validates against).
    const channelId = configAfterActivate.channelId!;
    const channelToken = buildChannelToken({ channelId });
    const webhookResp = await request.post(
      "/api/webhooks/google-sheets",
      {
        headers: {
          "x-goog-channel-id": channelId,
          "x-goog-channel-token": channelToken,
          "x-goog-resource-id": configAfterActivate.resourceId!,
          "x-goog-resource-state": "update",
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

    // ── 10. Mock saw exactly the expected Sheets calls ──
    const callsAfterWebhook = await fetchMockCalls(request, mock.baseUrl);
    // values.get: 1 from activate (snapshot) + 1 from pull = 2.
    expect(callsAfterWebhook.calls.sheetsValuesGet).toHaveLength(2);
    expect(callsAfterWebhook.calls.sheetsValuesGet[1]!.range).toBe(
      "Sheet1!A:Z",
    );
    // values.append called exactly once with the action's hardcoded values
    // and Q11 valueInputOption = USER_ENTERED.
    expect(callsAfterWebhook.calls.sheetsValuesAppend).toHaveLength(1);
    const appendCall = callsAfterWebhook.calls.sheetsValuesAppend[0]!;
    expect(appendCall.spreadsheetId).toBe("ss-e2e-test");
    expect(appendCall.range).toBe("Sheet2!A:B");
    expect(appendCall.valueInputOption).toBe("USER_ENTERED");
    // Action handler wraps the single row in [[...]] before sending to Sheets.
    expect(appendCall.body.values).toEqual([
      ["echoed-from-trigger", "ok"],
    ]);
    // Authorization header carries the (decrypted) access token — proves
    // the encryption round-trip + refreshAndRetry plumbing.
    expect(appendCall.authorization).toBe("Bearer ya29.mock-e2e-access");

    // ── 11. trigger_resources row-count snapshot advanced + dedup row written ──
    const triggerRowsAfterWebhook = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterWebhook).toHaveLength(1);
    const triggerAfterWebhook = triggerRowsAfterWebhook[0]! as Record<
      string,
      unknown
    >;
    const configAfterWebhook = triggerAfterWebhook.config as {
      lastRowCount?: number;
    };
    expect(configAfterWebhook.lastRowCount).toBe(1);

    // Dedup row written under (provider='google-sheets',
    // event_id='ss-e2e-test:Sheet1:1:<12-hex>'). The hash is opaque; we
    // assert the row exists by querying the prefix.
    // (See normalize.ts for the eventId construction.)
    // Look up by exact eventId — we can compute the expected eventId
    // here using the same hash V2 uses.
    const dedupEventId = computeSheetsEventId(
      "ss-e2e-test",
      "Sheet1",
      1,
      [aliceLabel, aliceEmail],
    );
    const dedupRow = await getDedupRow("google-sheets", dedupEventId);
    expect(dedupRow).not.toBeNull();

    // ── 12. UI: Run history shows the succeeded run ──
    await page.reload();
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i)).toBeVisible();

    // ── 13. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ── 14. Dedup probe — POST same webhook a second time ──
    // Sheets' "dedup" works at V2's row-count baseline: lastRowCount is
    // now 1, the mock's row count is still 1, so pull computes
    // currentRowCount === lastRowCount and emits zero events. No
    // dispatch, no second run, no second action call. The
    // webhook_event_dedup table written in step 11 isn't even consulted
    // because pull short-circuited.
    const webhookResp2 = await request.post(
      "/api/webhooks/google-sheets",
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

    // Give the engine a moment to NOT execute a second run.
    await new Promise((r) => setTimeout(r, 1500));
    const runsAfterReplay = await getWorkflowRunsForUser(user.id);
    expect(runsAfterReplay).toHaveLength(1);

    const callsAfterReplay = await fetchMockCalls(request, mock.baseUrl);
    // values.get fired again on the second webhook (3 total: activate +
    // pull1 + pull2). values.append count stayed at 1 — the load-bearing
    // assertion that the action did NOT double-fire.
    expect(callsAfterReplay.calls.sheetsValuesGet).toHaveLength(3);
    expect(callsAfterReplay.calls.sheetsValuesAppend).toHaveLength(1);
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
 * Compute the Sheets row eventId the same way
 * `integrations/google-sheets/triggers/rowChanged/normalize.ts` does.
 * Format: `${spreadsheetId}:${sheetName}:${rowIndex}:${sha256(values).slice(0,12)}`
 *
 * Inlined here (rather than importing the V2 module) so the assertion
 * stays close to the test — if normalize.ts changes its hash format,
 * this helper has to update too, which is a desirable forcing function.
 */
function computeSheetsEventId(
  spreadsheetId: string,
  sheetName: string,
  rowIndex: number,
  values: ReadonlyArray<unknown>,
): string {
  // Use the same algorithm as normalize.ts: SHA-256 of JSON.stringify(values),
  // sliced to 12 hex chars.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  const hash = createHash("sha256")
    .update(JSON.stringify(values))
    .digest("hex")
    .slice(0, 12);
  return `${spreadsheetId}:${sheetName}:${rowIndex}:${hash}`;
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
    userinfo: { authorization: string | undefined }[];
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
    sheetsValuesGet: {
      authorization: string | undefined;
      url: string;
      spreadsheetId: string;
      range: string;
      responseRowCount: number;
    }[];
    sheetsValuesAppend: {
      authorization: string | undefined;
      url: string;
      spreadsheetId: string;
      range: string;
      body: Record<string, unknown>;
      valueInputOption: string | null;
    }[];
    // Sheets 2.1 — additional call recorders surfaced by the mock for
    // the cell + row + spreadsheet lifecycle action set. Existing
    // tests don't read these; the 2.1 test below does.
    sheetsValuesUpdate?: {
      authorization: string | undefined;
      url: string;
      spreadsheetId: string;
      range: string;
      body: Record<string, unknown>;
      valueInputOption: string | null;
    }[];
    sheetsSpreadsheetsGet?: {
      authorization: string | undefined;
      url: string;
      spreadsheetId: string;
    }[];
    sheetsSpreadsheetsCreate?: {
      authorization: string | undefined;
      url: string;
      body: Record<string, unknown>;
      title: string | null;
      initialSheetCount: number;
      firstInitialSheetTitle: string | null;
      responseSpreadsheetId: string;
    }[];
    sheetsSpreadsheetsBatchUpdate?: {
      authorization: string | undefined;
      url: string;
      spreadsheetId: string;
      body: Record<string, unknown>;
      requestCount: number;
      firstDeleteDimensionRange: {
        sheetId?: number;
        dimension?: string;
        startIndex?: number;
        endIndex?: number;
      } | null;
    }[];
  };
  currentSheetsRowCount: number;
}

async function fetchMockCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<MockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as MockInspect;
}

/**
 * Sheets 2.1 — full action surface end-to-end.
 *
 * One workflow, one webhook fire, FIVE chained actions:
 *   1. get_cell_value
 *   2. update_cell
 *   3. find_row
 *   4. delete_row
 *   5. create_spreadsheet
 *
 * The actions are linked by edges (linear chain) so the BFS engine runs
 * them in sequence. Each action is independent — none consume upstream
 * outputs — so a single trigger event drives the entire surface. This
 * compresses what would otherwise be 5 separate sign-in / connect /
 * activate cycles into one walkthrough.
 *
 * Mock state for find_row: we pre-populate the sheet with a header row +
 * 2 data rows BEFORE activate. The activate snapshot stores
 * `lastRowCount=3`. We then inject one more row to fire the trigger; pull
 * sees 4 > 3 and emits exactly one event. find_row reads the full sheet
 * via values.get and matches `alice` at row 2 (1-indexed including
 * header).
 *
 * Mock state for delete_row: `spreadsheets.get` returns a sheet with
 * `sheetId=0` for "Sheet1". delete_row's handler resolves the sheetName
 * → sheetId via that call, then sends a batchUpdate with deleteDimension
 * `{startIndex:2, endIndex:3}` to delete spreadsheet row 3 (bob). The
 * mock records but does NOT mutate `currentSheetsRows` — that's
 * deliberate: the chain's subsequent calls (none here) wouldn't see the
 * effect anyway, and keeping the row store immutable across action
 * dispatch makes the assertion math straightforward.
 *
 * Mock state for create_spreadsheet: synthetic `spreadsheetId =
 * mock-ss-${Date.now()}` echoed back; the spec asserts the regex shape
 * (not the exact id) to stay robust against re-runs.
 *
 * Mock state for update_cell: mock records the PUT but does NOT apply
 * the value. get_cell_value runs BEFORE update_cell in the chain so it
 * reads the original "Name" header from row 1 col 1 — proving the
 * read-path plumbing without depending on the mock applying writes.
 */
test.describe("Sheets 2.1 — cell + row + spreadsheet lifecycle actions e2e", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("row_changed → get_cell_value → update_cell → find_row → delete_row → create_spreadsheet — 5 actions execute end-to-end", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readGoogleMockState();

    // Reset mock so call counts are scoped to this run.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // Pre-populate sheet: 1 header row + 2 data rows. Activate's snapshot
    // captures lastRowCount=3 so the post-activate inject of 1 more row
    // emits exactly ONE trigger event (not 4). find_row matches "alice"
    // at row 2 (header at row 1).
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: ["Name", "Email"] },
    });
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: ["alice", "alice@e.test"] },
    });
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: ["bob", "bob@e.test"] },
    });

    // ── Sign in + Connect Sheets ──
    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=google-sheets/),
      page.getByRole("button", { name: "Connect Google Sheets" }).click(),
    ]);

    // ── Create workflow ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page.getByLabel(/workflow name/i).fill("E2E Sheets 2.1 — 5 Actions");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── Patch the draft with the 5-action chain ──
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "google-sheets",
          type: "row_changed",
          config: {
            spreadsheetId: "ss-2.1-e2e",
            sheetName: "Sheet1",
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-get-cell",
          kind: "action" as const,
          provider: "google-sheets",
          type: "get_cell_value",
          config: {
            spreadsheetId: "ss-2.1-e2e",
            sheetName: "Sheet1",
            cell: "A1",
          },
          position: { x: 0, y: 100 },
        },
        {
          id: "action-update-cell",
          kind: "action" as const,
          provider: "google-sheets",
          type: "update_cell",
          config: {
            spreadsheetId: "ss-2.1-e2e",
            sheetName: "Sheet1",
            cell: "A1",
            value: "updated-by-e2e",
            valueInputOption: "USER_ENTERED",
          },
          position: { x: 0, y: 200 },
        },
        {
          id: "action-find-row",
          kind: "action" as const,
          provider: "google-sheets",
          type: "find_row",
          config: {
            spreadsheetId: "ss-2.1-e2e",
            sheetName: "Sheet1",
            column: "Name",
            value: "alice",
            operator: "equals",
          },
          position: { x: 0, y: 300 },
        },
        {
          id: "action-delete-row",
          kind: "action" as const,
          provider: "google-sheets",
          type: "delete_row",
          config: {
            spreadsheetId: "ss-2.1-e2e",
            sheetName: "Sheet1",
            rowNumber: 3,
          },
          position: { x: 0, y: 400 },
        },
        {
          id: "action-create-spreadsheet",
          kind: "action" as const,
          provider: "google-sheets",
          type: "create_spreadsheet",
          config: {
            title: "Created by 2.1 e2e",
            initialSheetName: "Data",
          },
          position: { x: 0, y: 500 },
        },
      ],
      edges: [
        { id: "e1", from: "trigger-node", to: "action-get-cell" },
        { id: "e2", from: "action-get-cell", to: "action-update-cell" },
        { id: "e3", from: "action-update-cell", to: "action-find-row" },
        { id: "e4", from: "action-find-row", to: "action-delete-row" },
        { id: "e5", from: "action-delete-row", to: "action-create-spreadsheet" },
      ],
    };
    const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    await page.reload();

    // ── Activate ──
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    const triggerConfig = triggerAfterActivate.config as {
      channelId: string;
      resourceId: string;
      lastRowCount: number;
    };
    // Pre-populated 3 rows → snapshot captures lastRowCount=3 so the
    // post-inject pull emits exactly one event for row 4.
    expect(triggerConfig.lastRowCount).toBe(3);

    // ── Inject the trigger row + POST the push notification ──
    // Per-run unique inject value so webhook_event_dedup (system-wide
    // table, not cascaded by deleteTestUser) doesn't collide across
    // consecutive runs. The trigger eventId hash includes JSON of the
    // row values; without randomization the second run's eventId
    // matches the first and the dispatcher drops the event as a
    // duplicate. Same pattern Slice 5b's single-action test uses.
    const carolLabel = `carol-${randomUUID()}`;
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: [carolLabel, "carol@e.test"] },
    });
    const channelToken = buildChannelToken({
      channelId: triggerConfig.channelId,
    });
    const webhookResp = await request.post("/api/webhooks/google-sheets", {
      headers: {
        "x-goog-channel-id": triggerConfig.channelId,
        "x-goog-channel-token": channelToken,
        "x-goog-resource-id": triggerConfig.resourceId,
        "x-goog-resource-state": "update",
        "x-goog-message-number": "1",
      },
    });
    expect(webhookResp.status(), await webhookResp.text()).toBe(200);

    // ── Wait for the workflow_run row to appear with succeeded status ──
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

    // ── Per-step output assertions ──
    const steps = run.steps as ReadonlyArray<{
      nodeId: string;
      status: string;
      output?: Record<string, unknown>;
    }>;
    const stepBy = (id: string) => {
      const step = steps.find((s) => s.nodeId === id);
      if (!step) throw new Error(`step ${id} missing in run.steps`);
      return step;
    };

    // 1. get_cell_value — reads row 1 col 1 ("Name" header).
    const stepGet = stepBy("action-get-cell");
    expect(stepGet.status).toBe("succeeded");
    expect(stepGet.output).toEqual({
      spreadsheetId: "ss-2.1-e2e",
      sheetName: "Sheet1",
      cell: "A1",
      value: "Name",
    });

    // 2. update_cell — wrapper accepts; output mirrors mock response.
    const stepUpdate = stepBy("action-update-cell");
    expect(stepUpdate.status).toBe("succeeded");
    expect(stepUpdate.output?.updated).toBe(true);
    expect(stepUpdate.output?.cell).toBe("A1");
    expect(stepUpdate.output?.sheetName).toBe("Sheet1");
    expect(stepUpdate.output?.updatedRange).toBe("Sheet1!A1");

    // 3. find_row — matches "alice" at sheet row 2.
    const stepFind = stepBy("action-find-row");
    expect(stepFind.status).toBe("succeeded");
    expect(stepFind.output).toEqual({
      spreadsheetId: "ss-2.1-e2e",
      sheetName: "Sheet1",
      column: "Name",
      found: true,
      firstMatch: {
        rowNumber: 2,
        rowData: { Name: "alice", Email: "alice@e.test" },
      },
      matches: [
        {
          rowNumber: 2,
          rowData: { Name: "alice", Email: "alice@e.test" },
        },
      ],
      count: 1,
    });

    // 4. delete_row — resolves sheetName → sheetId=0, sends deleteDimension.
    const stepDelete = stepBy("action-delete-row");
    expect(stepDelete.status).toBe("succeeded");
    expect(stepDelete.output).toEqual({
      spreadsheetId: "ss-2.1-e2e",
      sheetName: "Sheet1",
      sheetId: 0,
      rowNumber: 3,
      deleted: true,
    });

    // 5. create_spreadsheet — mock returns synthetic id matching the
    // mock-ss-<timestamp> shape.
    const stepCreate = stepBy("action-create-spreadsheet");
    expect(stepCreate.status).toBe("succeeded");
    expect(stepCreate.output?.spreadsheetId).toMatch(/^mock-ss-\d+$/);
    expect(stepCreate.output?.title).toBe("Created by 2.1 e2e");
    expect(stepCreate.output?.spreadsheetUrl).toMatch(
      /^https:\/\/docs\.google\.com\/spreadsheets\/d\/mock-ss-\d+\/edit$/,
    );
    expect(stepCreate.output?.firstSheet).toEqual({
      sheetId: 0,
      title: "Data",
    });

    // ── Mock-call assertions ──
    const inspect = await fetchMockCalls(request, mock.baseUrl);

    // values.get calls: 1 activate snapshot + 1 webhook pull + 1
    // get_cell_value (Sheet1!A1) + 1 find_row (Sheet1) = 4.
    expect(inspect.calls.sheetsValuesGet).toHaveLength(4);
    const valuesGetRanges = inspect.calls.sheetsValuesGet.map((c) => c.range);
    expect(valuesGetRanges).toContain("Sheet1!A1");
    expect(valuesGetRanges).toContain("Sheet1");

    // values.update calls: 1 from update_cell (PUT Sheet1!A1).
    expect(inspect.calls.sheetsValuesUpdate).toHaveLength(1);
    const updateCall = inspect.calls.sheetsValuesUpdate![0]!;
    expect(updateCall.spreadsheetId).toBe("ss-2.1-e2e");
    expect(updateCall.range).toBe("Sheet1!A1");
    expect(updateCall.valueInputOption).toBe("USER_ENTERED");
    expect(updateCall.body.values).toEqual([["updated-by-e2e"]]);
    expect(updateCall.authorization).toBe("Bearer ya29.mock-e2e-access");

    // spreadsheets.create calls: 1 from create_spreadsheet.
    expect(inspect.calls.sheetsSpreadsheetsCreate).toHaveLength(1);
    const createCall = inspect.calls.sheetsSpreadsheetsCreate![0]!;
    expect(createCall.title).toBe("Created by 2.1 e2e");
    expect(createCall.initialSheetCount).toBe(1);
    expect(createCall.firstInitialSheetTitle).toBe("Data");
    expect(createCall.authorization).toBe("Bearer ya29.mock-e2e-access");

    // spreadsheets.get calls: 1 from delete_row's sheetName → sheetId lookup.
    expect(inspect.calls.sheetsSpreadsheetsGet).toHaveLength(1);
    expect(inspect.calls.sheetsSpreadsheetsGet![0]!.spreadsheetId).toBe(
      "ss-2.1-e2e",
    );

    // spreadsheets.batchUpdate calls: 1 from delete_row.
    expect(inspect.calls.sheetsSpreadsheetsBatchUpdate).toHaveLength(1);
    const batchCall = inspect.calls.sheetsSpreadsheetsBatchUpdate![0]!;
    expect(batchCall.spreadsheetId).toBe("ss-2.1-e2e");
    expect(batchCall.requestCount).toBe(1);
    expect(batchCall.firstDeleteDimensionRange).toEqual({
      sheetId: 0,
      dimension: "ROWS",
      startIndex: 2,
      endIndex: 3,
    });

    // No values.append calls — the 2.1 surface has no append-shaped action.
    expect(inspect.calls.sheetsValuesAppend).toHaveLength(0);
  });
});
