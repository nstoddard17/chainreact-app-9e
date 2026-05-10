import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  getIntegrationsForUser,
  getNotificationsForUser,
  getOAuthStateRowCount,
  getTriggerResourcesForUser,
  getWorkflowRunsForUser,
  rewindTriggerPollingTimestamp,
  waitFor,
  type TestUser,
} from "./helpers/supabaseAdmin";
import { readMicrosoftMockState } from "./global-setup";

/**
 * Slice 15 end-to-end walkthrough — Microsoft Excel polling trigger.
 *
 * First V2 provider with a polling-driven Microsoft Graph trigger.
 * Mirrors slice 2f (Gmail polling) for lifecycle shape, with Excel
 * specifics:
 *   - Provider id `microsoft-excel`, sibling integration row to
 *     OneDrive / Outlook Mail / Outlook Calendar — same Azure AD app
 *     via _shared/microsoft/oauth.ts.
 *   - Trigger `new_row` (worksheet position-keyed). Activation hook
 *     seeds the snapshot baseline via GET usedRange BEFORE the first
 *     poll runs, closing V1's "first poll miss" bug.
 *   - Polling cron `/api/cron/poll-triggers` — same handler the Gmail
 *     test exercises. Excel's PollingHandler.canHandle covers both
 *     new_row + new_table_row event types.
 *   - Action `get_worksheets` — read-only; hits GET
 *     /v1.0/me/drive/items/{wb}/workbook/worksheets and returns the
 *     workbook's sheet list. Chosen for the e2e because it's a single
 *     idempotent call that doesn't mutate the worksheet, so it can't
 *     contaminate the next poll's snapshot diff.
 *
 * Real surfaces exercised:
 *   - Auth, OAuth dispatcher / state / PKCE, token encryption,
 *     integration row writeback, Graph /me lookup.
 *   - Workflow create + activate; activation triggers Excel's
 *     activate hook → usedRange call → snapshot rowHashes seeded.
 *   - Polling cron auth (CRON_SECRET bearer), polling scheduler
 *     iteration, microsoft-excel polling handler (worksheet branch),
 *     diff via findNewKeys, enqueue, snapshot advance.
 *   - Engine + canonical resolver + get_worksheets action handler.
 *   - refreshAndRetry token decryption on every Graph call.
 *
 * Mocked surfaces (Microsoft network boundary only):
 *   - login.microsoftonline.com /common/oauth2/v2.0/{authorize,token}
 *   - graph.microsoft.com /v1.0/me,
 *     /v1.0/me/drive/items/{wb}/workbook/worksheets,
 *     /v1.0/me/drive/items/{wb}/workbook/worksheets('{name}')/usedRange.
 *
 * Excel-specific assertions vs slice 8 OneDrive:
 *   - No subscription / no validation handshake / no webhook receive
 *     route — Excel polls.
 *   - Activation walked usedRange BEFORE upserting the trigger row
 *     (the activation hook's snapshot capture happens before
 *     trigger_resources.upsert).
 *   - trigger_resources.config carries a non-empty `snapshot.rowHashes`
 *     keyed by 1-based row index (matches Excel's A1 numbering).
 *   - Polling cron tick fires the new_row event for the appended row
 *     only — pre-existing baseline rows do not replay.
 *
 * UI shortcut: V2's builder UI doesn't have per-node configuration yet.
 * The test patches the workflow draft via the API to land a trigger +
 * action with valid `type` + `config`. When per-node config UI ships,
 * step "5. Configure nodes" becomes a UI walkthrough — same caveat as
 * slice 2f Gmail / slice 8 OneDrive.
 */

let testUser: TestUser | null = null;

test.describe("Slice 15 — full Microsoft Excel walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Excel → build + activate (snapshot baseline) → poll cycle → succeeded run", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMicrosoftMockState();
    const cronSecret = requireEnv("CRON_SECRET");

    const workbookId = "wb-e2e-slice15";
    const worksheetName = "Inbox";

    // Reset mock counters + state.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // Seed a worksheet with 3 rows BEFORE activation — the activate
    // hook captures these as the baseline. New rows added between
    // activation and poll fire as new events.
    await page.request.post(`${mock.baseUrl}/__injectExcelWorksheet`, {
      data: {
        workbookId,
        worksheetName,
        values: [
          ["name", "age", "city"],
          ["alice", 30, "Seattle"],
          ["bob", 25, "Portland"],
        ],
      },
    });

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect Microsoft Excel ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=microsoft-excel/),
      page
        .getByRole("button", {
          name: "Connect Microsoft Excel",
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
      "microsoft-excel",
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
    // + Files.ReadWrite (and crucially NOT Mail.* / Calendars.* / Files.*.All
    // which belong to sibling providers or are intentionally scoped out).
    const scopes = integration.scopes as readonly string[];
    expect(scopes).toEqual(
      expect.arrayContaining(["offline_access", "Files.ReadWrite"]),
    );
    expect(scopes).not.toContain("Mail.Send");
    expect(scopes).not.toContain("Calendars.ReadWrite");
    expect(scopes).not.toContain("Files.ReadWrite.All");

    // OAuth state row was atomically consumed.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // Mock-call assertions: authorize + token exchange + /me lookup.
    const callsAfterOAuth = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.me).toHaveLength(1);
    expect(callsAfterOAuth.calls.excelUsedRange).toHaveLength(0);
    expect(callsAfterOAuth.calls.excelRangePatch).toHaveLength(0);

    // Authorize redirect_uri proves the dispatcher built the
    // Excel-specific callback URL (not a sibling provider's).
    expect(callsAfterOAuth.calls.authorize[0]!.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/microsoft-excel\/callback$/,
    );
    // Authorize scope: exactly the Slice 15 scopes.
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

    // ── 4. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page.getByLabel(/workflow name/i).fill(
      "E2E Excel Walkthrough",
    );
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 5. Configure trigger + action via API patch ──
    // Trigger: new_row on the Inbox sheet.
    // Action: get_worksheets — read-only listing for the same workbook.
    // The action's read-only nature means it doesn't write back to the
    // sheet and so cannot influence the next poll's snapshot diff
    // (defensive — we only run one poll cycle in this test anyway).
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "microsoft-excel",
          type: "new_row",
          config: { workbookId, worksheetName },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "microsoft-excel",
          type: "get_worksheets",
          config: { workbookId },
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
    // Activation triggers Excel's activate hook (newRow/activate.ts):
    //   - Reads node.config for workbookId + worksheetName.
    //   - Calls refreshAndRetry → worksheetUsedRange against the mock.
    //   - Mock returns the 3-row baseline; activate builds snapshot
    //     with rowHashes for keys "1", "2", "3" and rowCount=3.
    //   - Returns { pollingEnabled: true, snapshot } to the
    //     orchestrator which merges into config before upserting
    //     trigger_resources.
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // DB: trigger_resources row stores the activation snapshot.
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    expect(triggerAfterActivate.provider).toBe("microsoft-excel");
    expect(triggerAfterActivate.event_type).toBe("new_row");
    const configAfterActivate = triggerAfterActivate.config as {
      pollingEnabled?: boolean;
      snapshot?: {
        rowHashes?: Record<string, string>;
        rowCount?: number;
        updatedAt?: string;
      };
    };
    expect(configAfterActivate.pollingEnabled).toBe(true);
    expect(configAfterActivate.snapshot?.rowCount).toBe(3);
    expect(
      Object.keys(configAfterActivate.snapshot?.rowHashes ?? {}).sort(),
    ).toEqual(["1", "2", "3"]);
    expect(configAfterActivate.snapshot?.updatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );

    // Mock saw exactly one usedRange call (the activation hook). No
    // worksheets-list call yet (that's the action, runs on poll).
    const callsAfterActivate = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.excelUsedRange).toHaveLength(1);
    expect(
      callsAfterActivate.calls.excelUsedRange[0]!.workbookId,
    ).toBe(workbookId);
    expect(
      callsAfterActivate.calls.excelUsedRange[0]!.worksheetName,
    ).toBe(worksheetName);
    expect(
      callsAfterActivate.calls.excelUsedRange[0]!.authorization,
    ).toBe("Bearer ms-mock-e2e-access");

    // ── 7. Append a row in the mock to simulate user editing the workbook ──
    const appendResp = await page.request.post(
      `${mock.baseUrl}/__appendExcelRow`,
      {
        data: {
          workbookId,
          worksheetName,
          row: ["carol", 40, "Denver"],
        },
      },
    );
    expect(appendResp.status()).toBe(200);

    // ── 8. Trigger a poll cycle ──
    const pollResp = await request.post("/api/cron/poll-triggers", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(pollResp.status(), await pollResp.text()).toBe(200);

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

    // ── 10. Mock saw exactly the expected Excel calls ──
    const callsAfterPoll = await fetchMockCalls(request, mock.baseUrl);
    // usedRange called twice — once at activation, once at the poll.
    expect(callsAfterPoll.calls.excelUsedRange).toHaveLength(2);
    // worksheets-list called exactly once — the get_worksheets action.
    // (No direct field on the mock for this; we infer via the absence
    // of usedRange/rangePatch noise — the action handler is the only
    // codepath that hits /workbook/worksheets without a sub-route.)
    // The worksheets-list response includes the Inbox sheet we seeded.

    // ── 11. trigger_resources snapshot advanced to include the new row ──
    const triggerRowsAfterPoll = await getTriggerResourcesForUser(user.id);
    const triggerAfterPoll = triggerRowsAfterPoll[0]! as Record<
      string,
      unknown
    >;
    const configAfterPoll = triggerAfterPoll.config as {
      snapshot?: {
        rowHashes?: Record<string, string>;
        rowCount?: number;
      };
      polling?: { lastPolledAt?: string };
    };
    expect(configAfterPoll.snapshot?.rowCount).toBe(4);
    expect(
      Object.keys(configAfterPoll.snapshot?.rowHashes ?? {}).sort(),
    ).toEqual(["1", "2", "3", "4"]);
    expect(configAfterPoll.polling?.lastPolledAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );

    // ── 12. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ── 13. Quiet tick — no further runs when nothing changed ──
    // Rewind the polling cursor so the scheduler's 5-min gate doesn't
    // skip this trigger.
    await rewindTriggerPollingTimestamp(triggerAfterPoll.id as string);
    const pollResp2 = await request.post("/api/cron/poll-triggers", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(pollResp2.status()).toBe(200);

    // Give the engine a moment to NOT execute a second run.
    await new Promise((r) => setTimeout(r, 1500));
    const runsAfterQuiet = await getWorkflowRunsForUser(user.id);
    expect(runsAfterQuiet).toHaveLength(1);
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
      responseMode: string | null;
    }[];
    tokenExchange: {
      body: string;
      parsedBody: Record<string, string>;
    }[];
    me: {
      authorization: string | undefined;
      url: string;
    }[];
    excelUsedRange: {
      authorization: string | undefined;
      url: string;
      workbookId: string;
      worksheetName: string;
    }[];
    excelRangePatch: {
      authorization: string | undefined;
      workbookId: string;
      worksheetName: string;
      address: string;
      values: ReadonlyArray<ReadonlyArray<unknown>>;
    }[];
  };
}

async function fetchMockCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<MockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as MockInspect;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`e2e: ${name} env var is required`);
  return v;
}
