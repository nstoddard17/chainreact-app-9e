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
      // Sheets 2.2 Commit 4 — convenience extraction of the first
      // repeatCell request that format_range sends. Null when no
      // repeatCell request appears in the batch (delete_row case).
      firstRepeatCellRequest?: {
        range: {
          sheetId?: number;
          startRowIndex?: number;
          endRowIndex?: number;
          startColumnIndex?: number;
          endColumnIndex?: number;
        };
        userEnteredFormat: Record<string, unknown>;
        fields: string;
      } | null;
    }[];
    // Sheets 2.2 Commit 4 — batch_update mock recorder. Distinct from
    // spreadsheetsBatchUpdate above — values:batchUpdate is a
    // different endpoint with body-level valueInputOption.
    sheetsValuesBatchUpdate?: {
      authorization: string | undefined;
      url: string;
      spreadsheetId: string;
      body: Record<string, unknown>;
      valueInputOption: string | null;
      dataCount: number;
      dataRanges: ReadonlyArray<string>;
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

/**
 * Sheets 2.2 — batch_update + format_range end-to-end.
 *
 * ONE workflow chain off the existing `row_changed` trigger:
 *   batch_update  → format_range
 *
 * batch_update sends TWO updates to `values:batchUpdate` (the
 * endpoint distinct from `spreadsheets.batchUpdate`). format_range
 * exercises 5 of the 6 accepted options (backgroundColor + textColor
 * + bold + horizontalAlignment + numberFormat) so the test asserts
 * the dynamic `fields` mask construction + the per-leaf
 * userEnteredFormat paths.
 *
 * Mock plumbing exercised:
 *   - POST /v4/spreadsheets/{id}/values:batchUpdate — NEW handler
 *     (Sheets 2.2 Commit 4); records body.valueInputOption +
 *     body.data[] + range list.
 *   - POST /v4/spreadsheets/{id}:batchUpdate — extended (Sheets 2.2
 *     Commit 4) to extract `firstRepeatCellRequest` so the assertion
 *     reaches GridRange + userEnteredFormat + fields without walking
 *     body.requests[0].repeatCell.* inline.
 *
 * Re-uses the Sheets 2.1 chained-test pattern: pre-populate 3 rows
 * (header + 2 data) so the activate snapshot captures
 * lastRowCount=3, then inject one trigger row to emit exactly ONE
 * event. find_row + delete_row are NOT in this chain — those were
 * proven by the 2.1 walkthrough above.
 */
test.describe("Sheets 2.2 — batch_update + format_range actions e2e", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("row_changed → batch_update → format_range — both actions execute end-to-end", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readGoogleMockState();

    await page.request.post(`${mock.baseUrl}/__reset`);

    // Pre-populate 3 rows so lastRowCount=3 at activate; subsequent
    // single-row inject emits one event.
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: ["Name", "Amount"] },
    });
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: ["alice", 100] },
    });
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: ["bob", 200] },
    });

    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=google-sheets/),
      page.getByRole("button", { name: "Connect Google Sheets" }).click(),
    ]);

    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page.getByLabel(/workflow name/i).fill("E2E Sheets 2.2 — 2 Actions");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "google-sheets",
          type: "row_changed",
          config: {
            spreadsheetId: "ss-2.2-e2e",
            sheetName: "Sheet1",
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-batch-update",
          kind: "action" as const,
          provider: "google-sheets",
          type: "batch_update",
          config: {
            spreadsheetId: "ss-2.2-e2e",
            valueInputOption: "USER_ENTERED",
            updates: [
              { range: "Sheet1!A2:B2", values: [["alice-updated", 111]] },
              { range: "Sheet1!A3:B3", values: [["bob-updated", 222]] },
            ],
          },
          position: { x: 0, y: 100 },
        },
        {
          id: "action-format-range",
          kind: "action" as const,
          provider: "google-sheets",
          type: "format_range",
          config: {
            spreadsheetId: "ss-2.2-e2e",
            sheetName: "Sheet1",
            range: "A1:B2",
            backgroundColor: "#FFFF00",
            textColor: "#000000",
            bold: true,
            horizontalAlignment: "CENTER",
            numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" },
          },
          position: { x: 0, y: 200 },
        },
      ],
      edges: [
        { id: "e1", from: "trigger-node", to: "action-batch-update" },
        { id: "e2", from: "action-batch-update", to: "action-format-range" },
      ],
    };
    const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: { draftDefinition },
    });
    expect(patch.status(), await patch.text()).toBe(200);
    await page.reload();

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
    expect(triggerConfig.lastRowCount).toBe(3);

    // Per-run unique inject value so webhook_event_dedup (system-wide
    // table, not cascaded by deleteTestUser) doesn't collide across
    // consecutive runs. See the Sheets 2.1 chained test for the same
    // pattern + rationale.
    const carolLabel = `carol-${randomUUID()}`;
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: [carolLabel, 300] },
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

    // ── batch_update step assertions ──
    const stepBatch = stepBy("action-batch-update");
    expect(stepBatch.status).toBe("succeeded");
    expect(stepBatch.output).toEqual({
      spreadsheetId: "ss-2.2-e2e",
      totalUpdatedRanges: 2,
      totalUpdatedCells: 4, // 2 rows × 2 cols
      totalUpdatedRows: 2,
      totalUpdatedColumns: 4, // mock sums per-entry; each row is 2 cols → 2 + 2
      responses: [
        {
          updatedRange: "Sheet1!A2:B2",
          updatedRows: 1,
          updatedColumns: 2,
          updatedCells: 2,
        },
        {
          updatedRange: "Sheet1!A3:B3",
          updatedRows: 1,
          updatedColumns: 2,
          updatedCells: 2,
        },
      ],
    });

    // ── format_range step assertions ──
    const stepFormat = stepBy("action-format-range");
    expect(stepFormat.status).toBe("succeeded");
    expect(stepFormat.output).toEqual({
      spreadsheetId: "ss-2.2-e2e",
      sheetName: "Sheet1",
      sheetId: 0,
      formattedRange: "Sheet1!A1:B2",
      appliedFormat: {
        backgroundColor: "#FFFF00",
        textColor: "#000000",
        bold: true,
        horizontalAlignment: "CENTER",
        numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" },
      },
    });

    // ── Mock-call assertions ──
    const inspect = await fetchMockCalls(request, mock.baseUrl);

    // values:batchUpdate: 1 call from batch_update with the typed body.
    expect(inspect.calls.sheetsValuesBatchUpdate).toHaveLength(1);
    const batchCall = inspect.calls.sheetsValuesBatchUpdate![0]!;
    expect(batchCall.spreadsheetId).toBe("ss-2.2-e2e");
    expect(batchCall.valueInputOption).toBe("USER_ENTERED");
    expect(batchCall.dataCount).toBe(2);
    expect(batchCall.dataRanges).toEqual(["Sheet1!A2:B2", "Sheet1!A3:B3"]);
    // Body-level valueInputOption + data[{range, values}] shape (NOT
    // raw passthrough / NOT in the URL).
    expect(batchCall.body).toEqual({
      valueInputOption: "USER_ENTERED",
      data: [
        { range: "Sheet1!A2:B2", values: [["alice-updated", 111]] },
        { range: "Sheet1!A3:B3", values: [["bob-updated", 222]] },
      ],
    });
    expect(batchCall.url).not.toMatch(/[?&]valueInputOption=/);
    expect(batchCall.authorization).toBe("Bearer ya29.mock-e2e-access");

    // spreadsheets.batchUpdate: 1 call from format_range (one repeatCell).
    expect(inspect.calls.sheetsSpreadsheetsBatchUpdate).toHaveLength(1);
    const formatBatchCall = inspect.calls.sheetsSpreadsheetsBatchUpdate![0]!;
    expect(formatBatchCall.spreadsheetId).toBe("ss-2.2-e2e");
    expect(formatBatchCall.requestCount).toBe(1);
    // delete_row's deleteDimension is NOT present in this batch.
    expect(formatBatchCall.firstDeleteDimensionRange).toBeNull();

    // repeatCell request — GridRange + userEnteredFormat + fields mask.
    const repeatCell = formatBatchCall.firstRepeatCellRequest!;
    expect(repeatCell).not.toBeNull();
    expect(repeatCell.range).toEqual({
      sheetId: 0,
      startRowIndex: 0, // A1 → row 0
      endRowIndex: 2, // B2 → exclusive end row 2
      startColumnIndex: 0, // A
      endColumnIndex: 2, // B → exclusive end col 2
    });
    // userEnteredFormat carries the typed projection.
    expect(repeatCell.userEnteredFormat).toEqual({
      backgroundColor: { red: 1, green: 1, blue: 0 }, // #FFFF00
      horizontalAlignment: "CENTER",
      numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" },
      textFormat: {
        bold: true,
        foregroundColor: { red: 0, green: 0, blue: 0 }, // #000000
      },
    });
    // fields mask — per-leaf paths only (no broad userEnteredFormat
    // or userEnteredFormat.textFormat). Sorted for stable assertion;
    // handler joins on `,` in insertion order, so we split + sort.
    const fields = repeatCell.fields.split(",").sort();
    expect(fields).toEqual([
      "userEnteredFormat.backgroundColor",
      "userEnteredFormat.horizontalAlignment",
      "userEnteredFormat.numberFormat",
      "userEnteredFormat.textFormat.bold",
      "userEnteredFormat.textFormat.foregroundColor",
    ]);

    // Bounded-projection invariants:
    //  - No raw Google CellFormat sub-fields leak into the step
    //    output (e.g. no `fields` mask, no Google RGB nested object).
    expect(stepFormat.output).not.toHaveProperty("fields");
    expect(stepFormat.output).not.toHaveProperty("userEnteredFormat");
    expect(stepFormat.output).not.toHaveProperty("cellFormat");
    expect(
      (stepFormat.output!.appliedFormat as Record<string, unknown>)
        .backgroundColor,
    ).toBe("#FFFF00"); // hex echoed verbatim, NOT Google RGB
    //  - No raw Google response spread on batch_update output.
    expect(stepBatch.output).not.toHaveProperty("totalUpdatedSheets");
    expect(stepBatch.output).not.toHaveProperty("replies");
  });
});

/**
 * Sheets 2.3 — extended row_changed changeKinds (added / updated / removed)
 * end-to-end.
 *
 * Configures one workflow with `changeKinds: ["added","updated","removed"]`,
 * `snapshotRowLimit: 100`, `headerRow: false`. Activate seeds a bounded
 * per-row snapshot keyed positionally. Each of three operations (add /
 * update / remove) drives one webhook fire → one workflow run with the
 * matching `changeKind`.
 *
 * Per-run dedup safety: row values carry `randomUUID()` suffixes so the
 * `webhook_event_dedup` table (system-wide, NOT FK-cascaded by
 * deleteTestUser) doesn't collide across consecutive e2e runs. Same
 * pattern as the Slice 5b single-action test.
 *
 * Window-slide vs genuine-removal scenario is asserted by unit tests in
 * `tests/unit/integrations/google-sheets/triggers/_shared/snapshot.test.ts` —
 * exercising it from e2e would require a 200+ row pre-population to push
 * the sheet past the snapshot bound. The unit tests cover the diff
 * helper's branching; the e2e here covers the engine plumbing.
 */
test.describe("Sheets 2.3 — row_changed extended changeKinds e2e", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("row_changed → added → updated → removed produce three runs with matching changeKinds", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readGoogleMockState();

    await page.request.post(`${mock.baseUrl}/__reset`);

    // Per-run randomized row values so webhook_event_dedup
    // (system-wide table, not cascaded by deleteTestUser) doesn't
    // collide across consecutive e2e runs. The eventId hash includes
    // JSON.stringify(rowValues) — without per-run uniqueness, two
    // consecutive runs share the same eventId.
    const runId = randomUUID();
    const row1Values = [`a-${runId}`, "v1"] as const;
    const row2Values = [`b-${runId}`, "v2"] as const;
    const row3Values = [`c-${runId}`, "v3"] as const;
    const row2UpdatedValues = [`b-${runId}`, "v2-updated"] as const;

    // Pre-populate two rows so activate's snapshot captures
    // { "1": hash(row1), "2": hash(row2) }. The add/update/remove
    // sequence then drives one event each.
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: row1Values },
    });
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: row2Values },
    });

    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=google-sheets/),
      page.getByRole("button", { name: "Connect Google Sheets" }).click(),
    ]);

    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill("E2E Sheets 2.3 — extended changeKinds");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    const spreadsheetId = `ss-2.3-extended-${runId}`;
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "google-sheets",
          type: "row_changed",
          config: {
            spreadsheetId,
            sheetName: "Sheet1",
            headerRow: false,
            changeKinds: ["added", "updated", "removed"],
            snapshotRowLimit: 100,
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "google-sheets",
          type: "append_row",
          config: {
            spreadsheetId,
            range: "Log!A:B",
            values: ["row-event", "ok"],
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
    await page.reload();

    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    const triggerRows = await getTriggerResourcesForUser(user.id);
    expect(triggerRows).toHaveLength(1);
    const triggerConfig = triggerRows[0]!.config as {
      channelId: string;
      resourceId: string;
      changeKinds: string[];
      snapshot?: { rowHashes: Record<string, string>; rowCount: number };
    };
    expect(triggerConfig.changeKinds).toEqual(["added", "updated", "removed"]);
    // Extended path requires a seeded snapshot; absence is a regression.
    expect(triggerConfig.snapshot).toBeDefined();
    expect(triggerConfig.snapshot!.rowCount).toBe(2);
    expect(Object.keys(triggerConfig.snapshot!.rowHashes).sort()).toEqual([
      "1",
      "2",
    ]);

    const channelId = triggerConfig.channelId;
    const channelToken = buildChannelToken({ channelId });
    const fireWebhook = async (messageNumber: string) => {
      const resp = await request.post("/api/webhooks/google-sheets", {
        headers: {
          "x-goog-channel-id": channelId,
          "x-goog-channel-token": channelToken,
          "x-goog-resource-id": triggerConfig.resourceId,
          "x-goog-resource-state": "update",
          "x-goog-message-number": messageNumber,
        },
      });
      expect(resp.status(), await resp.text()).toBe(200);
    };

    const waitForRunCount = async (
      expected: number,
      description: string,
    ): Promise<ReadonlyArray<Record<string, unknown>>> =>
      waitFor(
        async () => {
          const rows = await getWorkflowRunsForUser(user.id);
          return rows.length >= expected ? rows : null;
        },
        { description, timeoutMs: 15_000 },
      );

    // ── Op 1: added row ─────────────────────────────────────────────
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: row3Values },
    });
    await fireWebhook("1");
    const runsAfterAdd = await waitForRunCount(1, "added run");
    expect(runsAfterAdd).toHaveLength(1);

    // ── Op 2: updated row ───────────────────────────────────────────
    await page.request.post(`${mock.baseUrl}/__updateSheetRow`, {
      data: { rowIndex: 2, values: row2UpdatedValues },
    });
    await fireWebhook("2");
    const runsAfterUpdate = await waitForRunCount(2, "updated run");
    expect(runsAfterUpdate).toHaveLength(2);

    // ── Op 3: removed row (delete the appended row 3) ───────────────
    await page.request.post(`${mock.baseUrl}/__deleteSheetRow`, {
      data: { rowIndex: 3 },
    });
    await fireWebhook("3");
    const runsAfterRemove = await waitForRunCount(3, "removed run");
    expect(runsAfterRemove).toHaveLength(3);

    // Sort runs by created_at for deterministic positional assertions.
    type Run = Record<string, unknown> & {
      trigger_event: {
        eventId: string;
        payload: {
          changeKind: string;
          spreadsheetId: string;
          sheetName: string;
          rowIndex: number | null;
          rowKey: string;
          keyColumn: string | null;
          keyValue: string | null;
          rowValues: ReadonlyArray<unknown> | null;
          previousValues: unknown;
        };
      };
      created_at: string;
      status: string;
    };
    const sortedRuns = (runsAfterRemove as ReadonlyArray<Run>)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    expect(sortedRuns.every((r) => r.status === "succeeded")).toBe(true);

    // Run 1: added row at sheet row 3.
    const addedRun = sortedRuns[0]!;
    expect(addedRun.trigger_event.payload.changeKind).toBe("added");
    expect(addedRun.trigger_event.payload.spreadsheetId).toBe(spreadsheetId);
    expect(addedRun.trigger_event.payload.sheetName).toBe("Sheet1");
    expect(addedRun.trigger_event.payload.rowIndex).toBe(3);
    expect(addedRun.trigger_event.payload.rowKey).toBe("3");
    expect(addedRun.trigger_event.payload.keyColumn).toBeNull();
    expect(addedRun.trigger_event.payload.keyValue).toBeNull();
    expect(addedRun.trigger_event.payload.rowValues).toEqual([...row3Values]);
    expect(addedRun.trigger_event.payload.previousValues).toBeNull();

    // Run 2: updated row at sheet row 2.
    const updatedRun = sortedRuns[1]!;
    expect(updatedRun.trigger_event.payload.changeKind).toBe("updated");
    expect(updatedRun.trigger_event.payload.rowIndex).toBe(2);
    expect(updatedRun.trigger_event.payload.rowKey).toBe("2");
    expect(updatedRun.trigger_event.payload.rowValues).toEqual([
      ...row2UpdatedValues,
    ]);
    expect(updatedRun.trigger_event.payload.previousValues).toBeNull();

    // Run 3: removed row — rowIndex/rowValues null per normalize.ts contract.
    const removedRun = sortedRuns[2]!;
    expect(removedRun.trigger_event.payload.changeKind).toBe("removed");
    expect(removedRun.trigger_event.payload.rowIndex).toBeNull();
    expect(removedRun.trigger_event.payload.rowKey).toBe("3");
    expect(removedRun.trigger_event.payload.rowValues).toBeNull();
    expect(removedRun.trigger_event.payload.previousValues).toBeNull();

    // EventIds carry the changeKind infix and are distinct across kinds.
    const eventIds = sortedRuns.map((r) => r.trigger_event.eventId);
    expect(new Set(eventIds).size).toBe(3);
    expect(eventIds[0]!).toContain(":added:");
    expect(eventIds[1]!).toContain(":updated:");
    expect(eventIds[2]!).toContain(":removed:");

    // Each run drove one append_row action call. Total: 3.
    const inspect = await fetchMockCalls(request, mock.baseUrl);
    expect(inspect.calls.sheetsValuesAppend).toHaveLength(3);
    for (const call of inspect.calls.sheetsValuesAppend) {
      expect(call.range).toBe("Log!A:B");
      expect(call.authorization).toBe("Bearer ya29.mock-e2e-access");
    }
  });

  /**
   * keyColumn stable identity — the load-bearing assertion for the
   * D-KeyColumn decision. With `keyColumn: "Email"` configured, a
   * positional shift (inserting a new row above existing ones) does
   * NOT fire updated events for shifted-but-unchanged rows. Only
   * genuine value changes — keyed by email — fire.
   *
   * The matched positional-mode behavior is unit-tested directly in
   * `_shared/snapshot.test.ts` (findUpdated / findRemoved with shifted
   * keys); the e2e here proves the full pipe (activate → webhook →
   * pull → snapshot diff → dispatch → engine → handler) honors the
   * keyColumn config end-to-end.
   */
  test("keyColumn → positional shift does NOT fire noise; only true keyed update fires", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readGoogleMockState();

    await page.request.post(`${mock.baseUrl}/__reset`);

    const runId = randomUUID();
    const aliceEmail = `alice-${runId}@e2e.test`;
    const bobEmail = `bob-${runId}@e2e.test`;
    const carolEmail = `carol-${runId}@e2e.test`;

    // Pre-populate: header + alice + bob. Activate's snapshot:
    // { "alice@…": hash([alice, "Alice"]), "bob@…": hash([bob, "Bob"]) }.
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: ["Email", "Name"] },
    });
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: [aliceEmail, "Alice"] },
    });
    await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
      data: { values: [bobEmail, "Bob"] },
    });

    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=google-sheets/),
      page.getByRole("button", { name: "Connect Google Sheets" }).click(),
    ]);

    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill("E2E Sheets 2.3 — keyColumn identity");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    const spreadsheetId = `ss-2.3-keycol-${runId}`;
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "google-sheets",
          type: "row_changed",
          config: {
            spreadsheetId,
            sheetName: "Sheet1",
            headerRow: true,
            keyColumn: "Email",
            changeKinds: ["added", "updated", "removed"],
            snapshotRowLimit: 100,
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "google-sheets",
          type: "append_row",
          config: {
            spreadsheetId,
            range: "Log!A:B",
            values: ["keyed-event", "ok"],
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
    await page.reload();

    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    const triggerRows = await getTriggerResourcesForUser(user.id);
    expect(triggerRows).toHaveLength(1);
    const triggerConfig = triggerRows[0]!.config as {
      channelId: string;
      resourceId: string;
      keyColumn: string | null;
      snapshot?: { rowHashes: Record<string, string>; keyMode: string };
    };
    expect(triggerConfig.keyColumn).toBe("Email");
    expect(triggerConfig.snapshot).toBeDefined();
    expect(triggerConfig.snapshot!.keyMode).toBe("keyColumn");
    expect(Object.keys(triggerConfig.snapshot!.rowHashes).sort()).toEqual(
      [aliceEmail, bobEmail].sort(),
    );

    const channelId = triggerConfig.channelId;
    const channelToken = buildChannelToken({ channelId });
    const fireWebhook = async (messageNumber: string) => {
      const resp = await request.post("/api/webhooks/google-sheets", {
        headers: {
          "x-goog-channel-id": channelId,
          "x-goog-channel-token": channelToken,
          "x-goog-resource-id": triggerConfig.resourceId,
          "x-goog-resource-state": "update",
          "x-goog-message-number": messageNumber,
        },
      });
      expect(resp.status(), await resp.text()).toBe(200);
    };

    const waitForRunCount = async (
      expected: number,
      description: string,
    ): Promise<ReadonlyArray<Record<string, unknown>>> =>
      waitFor(
        async () => {
          const rows = await getWorkflowRunsForUser(user.id);
          return rows.length >= expected ? rows : null;
        },
        { description, timeoutMs: 15_000 },
      );

    // ── Insert carol at sheet row 2 (first data row), shifting
    //    alice → row 3, bob → row 4. In positional mode this would
    //    look like added(2), updated(3), added(4) — three noisy events.
    //    In keyColumn mode: alice and bob keep their hashes (values
    //    unchanged), so only carol fires.
    await page.request.post(`${mock.baseUrl}/__insertSheetRow`, {
      data: { rowIndex: 2, values: [carolEmail, "Carol"] },
    });
    await fireWebhook("1");
    const runsAfterInsert = await waitForRunCount(1, "added carol");
    expect(runsAfterInsert).toHaveLength(1);

    // ── Update bob's row (now at sheet row 4 after the carol shift)
    //    so the only diff is bob's hash. alice should NOT fire even
    //    though her positional row index changed.
    await page.request.post(`${mock.baseUrl}/__updateSheetRow`, {
      data: { rowIndex: 4, values: [bobEmail, "Bob-Updated"] },
    });
    await fireWebhook("2");
    const runsAfterBobUpdate = await waitForRunCount(2, "updated bob");
    expect(runsAfterBobUpdate).toHaveLength(2);

    type Run = Record<string, unknown> & {
      trigger_event: {
        eventId: string;
        payload: {
          changeKind: string;
          rowIndex: number | null;
          rowKey: string;
          keyColumn: string | null;
          keyValue: string | null;
          rowValues: ReadonlyArray<unknown> | null;
        };
      };
      created_at: string;
      status: string;
    };
    const sortedRuns = (runsAfterBobUpdate as ReadonlyArray<Run>)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    expect(sortedRuns.every((r) => r.status === "succeeded")).toBe(true);

    // Run 1: added carol — keyValue = her email.
    const addedRun = sortedRuns[0]!;
    expect(addedRun.trigger_event.payload.changeKind).toBe("added");
    expect(addedRun.trigger_event.payload.keyColumn).toBe("Email");
    expect(addedRun.trigger_event.payload.keyValue).toBe(carolEmail);
    expect(addedRun.trigger_event.payload.rowKey).toBe(carolEmail);
    expect(addedRun.trigger_event.payload.rowValues).toEqual([
      carolEmail,
      "Carol",
    ]);
    // Positional rowIndex still surfaces — header at 1, carol at 2.
    expect(addedRun.trigger_event.payload.rowIndex).toBe(2);

    // Run 2: updated bob — keyValue = bob's email, NOT alice's.
    const updatedRun = sortedRuns[1]!;
    expect(updatedRun.trigger_event.payload.changeKind).toBe("updated");
    expect(updatedRun.trigger_event.payload.keyColumn).toBe("Email");
    expect(updatedRun.trigger_event.payload.keyValue).toBe(bobEmail);
    expect(updatedRun.trigger_event.payload.rowKey).toBe(bobEmail);
    expect(updatedRun.trigger_event.payload.rowValues).toEqual([
      bobEmail,
      "Bob-Updated",
    ]);
    // Positional rowIndex reflects bob's current position (header + 3).
    expect(updatedRun.trigger_event.payload.rowIndex).toBe(4);

    // Load-bearing assertion: NO run for alice. If positional shift had
    // emitted noise, we'd see a third run with her email.
    const keyValues = sortedRuns.map((r) => r.trigger_event.payload.keyValue);
    expect(keyValues).not.toContain(aliceEmail);

    // Exactly 2 action calls — proves the action did NOT fire for the
    // shifted-but-unchanged alice row.
    const inspect = await fetchMockCalls(request, mock.baseUrl);
    expect(inspect.calls.sheetsValuesAppend).toHaveLength(2);
  });
});

/**
 * Sheets 2.3 — new_worksheet trigger end-to-end.
 *
 * Activates a `new_worksheet` workflow. The activate hook seeds a
 * `worksheetSnapshot` of currently-known tab names via
 * `spreadsheets.get`, then registers the Drive `files.watch` on the
 * spreadsheet id. The next webhook + pull diffs the current names
 * against the baseline and fires one event per truly-new name.
 *
 * Per-run dedup safety: worksheet names carry `randomUUID()` suffixes
 * so the eventId (`${spreadsheetId}:new_worksheet:${sheetId}:${nameHash}`)
 * doesn't collide with prior e2e runs via `webhook_event_dedup`.
 *
 * Rename note: Google's metadata presents a rename as
 * `{remove old name, add new name}` and the trigger fires ONE event
 * for the new name. The rename scenario is covered by a dedicated
 * unit test in `triggers/_shared/snapshot.test.ts:findNewWorksheets`;
 * exercising it from e2e adds little plumbing coverage beyond the
 * baseline-add cycle here.
 */
test.describe("Sheets 2.3 — new_worksheet trigger e2e", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("new_worksheet → baseline does not fire; injecting a tab fires exactly one event", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readGoogleMockState();

    await page.request.post(`${mock.baseUrl}/__reset`);

    await signIn(page, user);
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=google-sheets/),
      page.getByRole("button", { name: "Connect Google Sheets" }).click(),
    ]);

    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill("E2E Sheets 2.3 — new_worksheet");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    const runId = randomUUID();
    const spreadsheetId = `ss-2.3-newws-${runId}`;
    const newWorksheetName = `Reports-${runId}`;

    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "google-sheets",
          type: "new_worksheet",
          config: { spreadsheetId },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "google-sheets",
          type: "append_row",
          config: {
            spreadsheetId,
            range: "Log!A:B",
            values: ["new-worksheet-event", "ok"],
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
    await page.reload();

    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // Activate persisted the worksheet baseline = ["Sheet1"] (the mock's
    // default seed). worksheetSnapshot lives on trigger_resources.config.
    const triggerRows = await getTriggerResourcesForUser(user.id);
    expect(triggerRows).toHaveLength(1);
    const triggerRow = triggerRows[0]! as Record<string, unknown>;
    expect(triggerRow.event_type).toBe("new_worksheet");
    const triggerConfig = triggerRow.config as {
      type: string;
      webhookEnabled: boolean;
      spreadsheetId: string;
      worksheetSnapshot?: { names: string[]; updatedAt: string };
      channelId: string;
      resourceId: string;
      pageToken: string;
      expiresAt: string;
    };
    expect(triggerConfig.type).toBe("subscription-watch");
    expect(triggerConfig.webhookEnabled).toBe(true);
    expect(triggerConfig.spreadsheetId).toBe(spreadsheetId);
    expect(triggerConfig.worksheetSnapshot).toBeDefined();
    expect(triggerConfig.worksheetSnapshot!.names).toEqual(["Sheet1"]);
    expect(triggerConfig.channelId).toMatch(
      /^chainreact-trigger-node-[0-9a-f-]+$/,
    );

    // Mock-call assertions after activate: 1 spreadsheets.get (baseline)
    // + 1 changes.getStartPageToken + 1 files.watch. No values.append yet.
    const callsAfterActivate = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.sheetsSpreadsheetsGet).toHaveLength(1);
    expect(callsAfterActivate.calls.driveChangesGetStartPageToken).toHaveLength(
      1,
    );
    expect(callsAfterActivate.calls.driveFilesWatch).toHaveLength(1);
    expect(callsAfterActivate.calls.sheetsValuesAppend).toHaveLength(0);

    const channelId = triggerConfig.channelId;
    const channelToken = buildChannelToken({ channelId });
    const fireWebhook = async (messageNumber: string) => {
      const resp = await request.post("/api/webhooks/google-sheets", {
        headers: {
          "x-goog-channel-id": channelId,
          "x-goog-channel-token": channelToken,
          "x-goog-resource-id": triggerConfig.resourceId,
          "x-goog-resource-state": "update",
          "x-goog-message-number": messageNumber,
        },
      });
      expect(resp.status(), await resp.text()).toBe(200);
    };

    // ── Baseline webhook (no new worksheet) → zero runs ─────────────
    await fireWebhook("1");
    // Allow time for any (unwanted) dispatch + run.
    await new Promise((r) => setTimeout(r, 1500));
    const runsBeforeInject = await getWorkflowRunsForUser(user.id);
    expect(runsBeforeInject).toHaveLength(0);

    // After the baseline pull, the mock should have logged 1 more
    // spreadsheets.get (the pull's metadata fetch).
    const callsAfterBaselinePull = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterBaselinePull.calls.sheetsSpreadsheetsGet).toHaveLength(2);
    expect(callsAfterBaselinePull.calls.sheetsValuesAppend).toHaveLength(0);

    // ── Inject a new worksheet via the mock control plane ──────────
    const injectResp = await page.request.post(
      `${mock.baseUrl}/__injectWorksheet`,
      { data: { title: newWorksheetName, sheetType: "GRID" } },
    );
    expect(injectResp.status()).toBe(200);
    const injectBody = (await injectResp.json()) as {
      worksheet: { sheetId: number; title: string; index: number };
      worksheetCount: number;
    };
    expect(injectBody.worksheetCount).toBe(2);
    const addedSheetId = injectBody.worksheet.sheetId;
    const addedIndex = injectBody.worksheet.index;

    // ── Fire webhook → pull diffs current=[Sheet1,Reports-X] against
    //    snapshot=[Sheet1] → emits ONE event for the new worksheet ──
    await fireWebhook("2");
    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      { description: "new_worksheet workflow_run", timeoutMs: 15_000 },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as Record<string, unknown> & {
      trigger_event: {
        provider: string;
        eventType: string;
        eventId: string;
        payload: Record<string, unknown>;
      };
    };
    expect(run.status).toBe("succeeded");
    expect(run.error_classification).toBeNull();
    expect(run.trigger_event.provider).toBe("google-sheets");
    expect(run.trigger_event.eventType).toBe("new_worksheet");
    expect(run.trigger_event.eventId).toBe(
      `${spreadsheetId}:new_worksheet:${addedSheetId}:${nameHashShort(newWorksheetName)}`,
    );
    expect(run.trigger_event.payload).toEqual({
      changeKind: "added",
      spreadsheetId,
      worksheetId: addedSheetId,
      worksheetName: newWorksheetName,
      index: addedIndex,
      sheetType: "GRID",
    });

    // Snapshot on the trigger row updated to include the new name.
    const triggerRowsAfter = await getTriggerResourcesForUser(user.id);
    const updatedConfig = triggerRowsAfter[0]!.config as {
      worksheetSnapshot: { names: string[]; updatedAt: string };
    };
    expect(updatedConfig.worksheetSnapshot.names).toEqual([
      "Sheet1",
      newWorksheetName,
    ]);

    // ── Second webhook with unchanged state → no new run ────────────
    await fireWebhook("3");
    await new Promise((r) => setTimeout(r, 1500));
    const runsAfterReplay = await getWorkflowRunsForUser(user.id);
    expect(runsAfterReplay).toHaveLength(1);

    // Mock-call totals: 4 spreadsheets.get (activate + baseline + new +
    // unchanged) + 1 files.watch + 1 startPageToken + 1 values.append.
    const inspect = await fetchMockCalls(request, mock.baseUrl);
    expect(inspect.calls.sheetsSpreadsheetsGet).toHaveLength(4);
    expect(inspect.calls.sheetsValuesAppend).toHaveLength(1);
    expect(inspect.calls.driveFilesWatch).toHaveLength(1);
    expect(inspect.calls.driveChangesGetStartPageToken).toHaveLength(1);
  });
});

/**
 * Compute the 12-char SHA-256 prefix the new_worksheet normalize uses
 * for the eventId nameHash component. Inlined (not imported from the
 * provider module) so a future hash-format change forces this test to
 * update too — same forcing function as the row_changed spec's
 * `computeSheetsEventId` helper.
 */
function nameHashShort(name: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256")
    .update(JSON.stringify(name))
    .digest("hex")
    .slice(0, 12);
}
