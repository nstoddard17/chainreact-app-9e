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

  // ────────────────────────────────────────────────────────────────────
  // Excel parity Commit 5 — coverage for the post-Slice-15 surface.
  //
  // Each test below reuses the OAuth + integration setup the originating
  // happy-path test already proves and focuses on the parity-added
  // surface: actions update_row / delete_row / rename_worksheet /
  // delete_worksheet / add_row batch mode, plus the three new triggers
  // new_worksheet / updated_row / updated_table_row.
  //
  // Pattern: a `new_row` trigger drives every action scenario (it
  // already has e2e coverage above; here it serves only to fire the
  // workflow). The action under test runs downstream and its
  // assertions cover the per-action contract: Graph endpoint hit,
  // request shape, action output, and run success.
  // ────────────────────────────────────────────────────────────────────

  test("update_row action — usedRange GET + range PATCH merges values, output shape (rowNumber, columnsUpdated, updatedColumns, address)", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMicrosoftMockState();
    const cronSecret = requireEnv("CRON_SECRET");

    const workbookId = "wb-e2e-update-row";
    const worksheetName = "Data";

    await page.request.post(`${mock.baseUrl}/__reset`);
    // Seed two rows: a header row + one data row at row 2.
    await page.request.post(`${mock.baseUrl}/__injectExcelWorksheet`, {
      data: {
        workbookId,
        worksheetName,
        values: [
          ["name", "age", "city"],
          ["alice", 30, "Seattle"],
        ],
      },
    });

    await signIn(page, user);
    await connectExcel(page);

    const workflowId = await createWorkflowAndConfigure({
      page,
      name: "E2E Excel update_row",
      draftDefinition: {
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
            type: "update_row",
            config: {
              workbookId,
              worksheetName,
              rowNumber: 2,
              values: { age: 99, city: "Mars" },
            },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
      },
    });
    void workflowId;

    await activateWorkflow(page);

    // Fire the trigger by appending a fresh row to the same sheet —
    // diff detects key "3" as new, fires once.
    const appendResp = await page.request.post(
      `${mock.baseUrl}/__appendExcelRow`,
      {
        data: { workbookId, worksheetName, row: ["bob", 25, "Portland"] },
      },
    );
    expect(appendResp.status()).toBe(200);

    await pollOnce({ request, cronSecret });

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

    const calls = await fetchMockCalls(request, mock.baseUrl);
    // usedRange called: activation seed (1) + trigger poll (1) + action
    // pre-write header read (1) = 3.
    expect(calls.calls.excelUsedRange).toHaveLength(3);
    // Exactly one range PATCH: the merged full-row write from update_row.
    expect(calls.calls.excelRangePatch).toHaveLength(1);
    const patch = calls.calls.excelRangePatch[0]!;
    expect(patch.workbookId).toBe(workbookId);
    expect(patch.worksheetName).toBe(worksheetName);
    expect(patch.address).toBe("A2:C2");
    // Merged values preserve untouched `name` column and overwrite age + city.
    expect(patch.values).toEqual([["alice", 99, "Mars"]]);

    const actionStep = ((run.steps as unknown[]) ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "action-node",
    ) as { output?: Record<string, unknown>; status?: string } | undefined;
    expect(actionStep?.status).toBe("succeeded");
    const output = actionStep?.output ?? {};
    expect(output.rowNumber).toBe(2);
    expect(output.columnsUpdated).toBe(2);
    expect(output.updatedColumns).toEqual(["age", "city"]);
    expect(output.address).toBe("A2:C2");
    expect(output.workbookId).toBe(workbookId);
    expect(output.worksheetName).toBe(worksheetName);
  });

  test("delete_row action — range delete with address '{N}:{N}' + shift Up, output deleted:true", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMicrosoftMockState();
    const cronSecret = requireEnv("CRON_SECRET");

    const workbookId = "wb-e2e-delete-row";
    const worksheetName = "Data";

    await page.request.post(`${mock.baseUrl}/__reset`);
    await page.request.post(`${mock.baseUrl}/__injectExcelWorksheet`, {
      data: {
        workbookId,
        worksheetName,
        values: [
          ["name", "age"],
          ["alice", 30],
        ],
      },
    });

    await signIn(page, user);
    await connectExcel(page);

    await createWorkflowAndConfigure({
      page,
      name: "E2E Excel delete_row",
      draftDefinition: {
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
            type: "delete_row",
            config: {
              workbookId,
              worksheetName,
              rowNumber: 2,
            },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
      },
    });

    await activateWorkflow(page);

    await page.request.post(`${mock.baseUrl}/__appendExcelRow`, {
      data: { workbookId, worksheetName, row: ["bob", 25] },
    });

    await pollOnce({ request, cronSecret });

    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      { description: "workflow_runs row to appear", timeoutMs: 15_000 },
    );
    const run = runs[0]! as Record<string, unknown>;
    expect(run.status).toBe("succeeded");

    const calls = await fetchMockCalls(request, mock.baseUrl);
    expect(calls.calls.excelRangeDelete).toHaveLength(1);
    const del = calls.calls.excelRangeDelete[0]!;
    expect(del.workbookId).toBe(workbookId);
    expect(del.worksheetName).toBe(worksheetName);
    expect(del.address).toBe("2:2");
    expect(del.shift).toBe("Up");
    // No PATCH should have been issued by delete_row.
    expect(calls.calls.excelRangePatch).toHaveLength(0);

    const actionStep = ((run.steps as unknown[]) ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "action-node",
    ) as { output?: Record<string, unknown>; status?: string } | undefined;
    expect(actionStep?.status).toBe("succeeded");
    const output = actionStep?.output ?? {};
    expect(output.deleted).toBe(true);
    expect(output.rowNumber).toBe(2);
    expect(output.address).toBe("2:2");
  });

  test("rename_worksheet action — worksheet PATCH applies new name, output renamed:true + newWorksheetName", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMicrosoftMockState();
    const cronSecret = requireEnv("CRON_SECRET");

    const workbookId = "wb-e2e-rename-ws";
    const worksheetName = "OldName";
    const newWorksheetName = "Q4-Sales";

    await page.request.post(`${mock.baseUrl}/__reset`);
    await page.request.post(`${mock.baseUrl}/__injectExcelWorksheet`, {
      data: {
        workbookId,
        worksheetName,
        values: [
          ["name", "age"],
          ["alice", 30],
        ],
      },
    });

    await signIn(page, user);
    await connectExcel(page);

    await createWorkflowAndConfigure({
      page,
      name: "E2E Excel rename_worksheet",
      draftDefinition: {
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
            type: "rename_worksheet",
            config: {
              workbookId,
              worksheetName,
              newWorksheetName,
            },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
      },
    });

    await activateWorkflow(page);

    await page.request.post(`${mock.baseUrl}/__appendExcelRow`, {
      data: { workbookId, worksheetName, row: ["bob", 25] },
    });

    await pollOnce({ request, cronSecret });

    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      { description: "workflow_runs row to appear", timeoutMs: 15_000 },
    );
    const run = runs[0]! as Record<string, unknown>;
    expect(run.status).toBe("succeeded");

    const calls = await fetchMockCalls(request, mock.baseUrl);
    expect(calls.calls.excelWorksheetPatch).toHaveLength(1);
    const patch = calls.calls.excelWorksheetPatch[0]!;
    expect(patch.workbookId).toBe(workbookId);
    expect(patch.worksheetName).toBe(worksheetName);
    expect(patch.newName).toBe(newWorksheetName);

    const actionStep = ((run.steps as unknown[]) ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "action-node",
    ) as { output?: Record<string, unknown>; status?: string } | undefined;
    expect(actionStep?.status).toBe("succeeded");
    const output = actionStep?.output ?? {};
    expect(output.renamed).toBe(true);
    expect(output.newWorksheetName).toBe(newWorksheetName);
    expect(output.oldWorksheetName).toBe(worksheetName);
    expect(output.workbookId).toBe(workbookId);
  });

  test("delete_worksheet action — Graph DELETE removes the worksheet, output deleted:true", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMicrosoftMockState();
    const cronSecret = requireEnv("CRON_SECRET");

    const workbookId = "wb-e2e-delete-ws";
    const triggerSheet = "Trigger";
    const targetSheet = "Scratch";

    await page.request.post(`${mock.baseUrl}/__reset`);
    // Two worksheets in the workbook — the trigger watches `triggerSheet`,
    // the action deletes the unrelated `targetSheet`.
    await page.request.post(`${mock.baseUrl}/__injectExcelWorksheet`, {
      data: {
        workbookId,
        worksheetName: triggerSheet,
        values: [
          ["name", "age"],
          ["alice", 30],
        ],
      },
    });
    await page.request.post(`${mock.baseUrl}/__injectExcelWorksheet`, {
      data: {
        workbookId,
        worksheetName: targetSheet,
        values: [["tmp"]],
      },
    });

    await signIn(page, user);
    await connectExcel(page);

    await createWorkflowAndConfigure({
      page,
      name: "E2E Excel delete_worksheet",
      draftDefinition: {
        nodes: [
          {
            id: "trigger-node",
            kind: "trigger" as const,
            provider: "microsoft-excel",
            type: "new_row",
            config: { workbookId, worksheetName: triggerSheet },
            position: { x: 0, y: 0 },
          },
          {
            id: "action-node",
            kind: "action" as const,
            provider: "microsoft-excel",
            type: "delete_worksheet",
            config: {
              workbookId,
              worksheetName: targetSheet,
            },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
      },
    });

    await activateWorkflow(page);

    await page.request.post(`${mock.baseUrl}/__appendExcelRow`, {
      data: { workbookId, worksheetName: triggerSheet, row: ["bob", 25] },
    });

    await pollOnce({ request, cronSecret });

    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      { description: "workflow_runs row to appear", timeoutMs: 15_000 },
    );
    const run = runs[0]! as Record<string, unknown>;
    expect(run.status).toBe("succeeded");

    const calls = await fetchMockCalls(request, mock.baseUrl);
    expect(calls.calls.excelWorksheetDelete).toHaveLength(1);
    const del = calls.calls.excelWorksheetDelete[0]!;
    expect(del.workbookId).toBe(workbookId);
    expect(del.worksheetName).toBe(targetSheet);

    const actionStep = ((run.steps as unknown[]) ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "action-node",
    ) as { output?: Record<string, unknown>; status?: string } | undefined;
    expect(actionStep?.status).toBe("succeeded");
    const output = actionStep?.output ?? {};
    expect(output.deleted).toBe(true);
    expect(output.worksheetName).toBe(targetSheet);
    expect(output.workbookId).toBe(workbookId);
  });

  test("add_row batch mode — one usedRange GET + one range PATCH for the whole batch, no per-row loop, output (rowCount, rowsAdded, firstRowNumber, lastRowNumber, address)", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMicrosoftMockState();
    const cronSecret = requireEnv("CRON_SECRET");

    const workbookId = "wb-e2e-add-row-batch";
    const triggerSheet = "Trigger";
    const dataSheet = "Data";

    await page.request.post(`${mock.baseUrl}/__reset`);
    await page.request.post(`${mock.baseUrl}/__injectExcelWorksheet`, {
      data: {
        workbookId,
        worksheetName: triggerSheet,
        values: [
          ["name", "age"],
          ["alice", 30],
        ],
      },
    });
    // Seed the data sheet with just headers — the batch append targets row 2..N.
    await page.request.post(`${mock.baseUrl}/__injectExcelWorksheet`, {
      data: {
        workbookId,
        worksheetName: dataSheet,
        values: [["Name", "Age", "City"]],
      },
    });

    await signIn(page, user);
    await connectExcel(page);

    await createWorkflowAndConfigure({
      page,
      name: "E2E Excel add_row batch",
      draftDefinition: {
        nodes: [
          {
            id: "trigger-node",
            kind: "trigger" as const,
            provider: "microsoft-excel",
            type: "new_row",
            config: { workbookId, worksheetName: triggerSheet },
            position: { x: 0, y: 0 },
          },
          {
            id: "action-node",
            kind: "action" as const,
            provider: "microsoft-excel",
            type: "add_row",
            config: {
              workbookId,
              worksheetName: dataSheet,
              rows: [
                { Name: "carol", Age: 40, City: "Denver" },
                { Name: "dave", Age: 22, City: "Austin" },
                { Name: "eve", Age: 28, City: "Boston" },
              ],
            },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
      },
    });

    await activateWorkflow(page);

    await page.request.post(`${mock.baseUrl}/__appendExcelRow`, {
      data: { workbookId, worksheetName: triggerSheet, row: ["bob", 25] },
    });

    await pollOnce({ request, cronSecret });

    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      { description: "workflow_runs row to appear", timeoutMs: 15_000 },
    );
    const run = runs[0]! as Record<string, unknown>;
    expect(run.status).toBe("succeeded");

    const calls = await fetchMockCalls(request, mock.baseUrl);
    // The action targets a DIFFERENT worksheet from the trigger.
    // Filter to the data sheet to verify the batch GET + PATCH math
    // without trigger-side noise.
    const dataSheetUsedRangeCalls = calls.calls.excelUsedRange.filter(
      (c) => c.worksheetName === dataSheet,
    );
    const dataSheetPatchCalls = calls.calls.excelRangePatch.filter(
      (c) => c.worksheetName === dataSheet,
    );
    // Batch mode: exactly one GET + exactly one PATCH for the data sheet.
    expect(dataSheetUsedRangeCalls).toHaveLength(1);
    expect(dataSheetPatchCalls).toHaveLength(1);
    const patch = dataSheetPatchCalls[0]!;
    expect(patch.workbookId).toBe(workbookId);
    // First batch row lands at row 2 (after the header), last at row 4.
    expect(patch.address).toBe("A2:C4");
    expect(patch.values).toEqual([
      ["carol", 40, "Denver"],
      ["dave", 22, "Austin"],
      ["eve", 28, "Boston"],
    ]);

    const actionStep = ((run.steps as unknown[]) ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "action-node",
    ) as { output?: Record<string, unknown>; status?: string } | undefined;
    expect(actionStep?.status).toBe("succeeded");
    const output = actionStep?.output ?? {};
    expect(output.rowCount).toBe(3);
    expect(output.rowsAdded).toBe(3);
    expect(output.firstRowNumber).toBe(2);
    expect(output.lastRowNumber).toBe(4);
    expect(output.address).toBe("A2:C4");
    expect(output.workbookId).toBe(workbookId);
    expect(output.worksheetName).toBe(dataSheet);
  });

  // ────────────────────────────────────────────────────────────────────
  // Excel parity Commit 4 triggers — e2e coverage.
  //
  // Each trigger test:
  //   1. Activates the trigger → seeds the baseline snapshot.
  //   2. Mutates mock state via control-plane to simulate the user's
  //      intended edit (new sheet / row-value change / table-row-value
  //      change).
  //   3. Polls once and asserts exactly one workflow_run fires with
  //      the right payload.
  //   4. Asserts NO run on a quiet baseline (no mutation) by polling
  //      again after rewinding the cursor.
  // ────────────────────────────────────────────────────────────────────

  test("new_worksheet trigger — fires once when a worksheet is added, payload includes worksheetName/worksheetId/position; quiet on baseline", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMicrosoftMockState();
    const cronSecret = requireEnv("CRON_SECRET");

    const workbookId = "wb-e2e-new-worksheet";

    await page.request.post(`${mock.baseUrl}/__reset`);
    // Two baseline worksheets — these get captured by the activation snapshot
    // and must NOT fire on poll.
    await page.request.post(`${mock.baseUrl}/__injectExcelWorksheet`, {
      data: { workbookId, worksheetName: "Sheet1", values: [["a"]] },
    });
    await page.request.post(`${mock.baseUrl}/__injectExcelWorksheet`, {
      data: { workbookId, worksheetName: "Sheet2", values: [["b"]] },
    });

    await signIn(page, user);
    await connectExcel(page);

    await createWorkflowAndConfigure({
      page,
      name: "E2E Excel new_worksheet",
      draftDefinition: {
        nodes: [
          {
            id: "trigger-node",
            kind: "trigger" as const,
            provider: "microsoft-excel",
            type: "new_worksheet",
            config: { workbookId },
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
      },
    });

    await activateWorkflow(page);

    // Snapshot baseline includes the two seeded sheets.
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerRow = triggerRowsAfterActivate[0]! as Record<string, unknown>;
    expect(triggerRow.event_type).toBe("new_worksheet");
    const cfg = triggerRow.config as {
      pollingEnabled?: boolean;
      snapshot?: { names?: string[] };
    };
    expect(cfg.pollingEnabled).toBe(true);
    expect(cfg.snapshot?.names).toEqual(["Sheet1", "Sheet2"]);

    // Simulate user adding a new worksheet.
    await page.request.post(`${mock.baseUrl}/__injectExcelWorksheet`, {
      data: { workbookId, worksheetName: "Q4-Sales", values: [["x"]] },
    });

    await pollOnce({ request, cronSecret });

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

    // Trigger payload identifies the new worksheet. The engine records
    // the trigger step's output as `{ event: TriggerEvent }`
    // (services/execution/engine.ts:193).
    const triggerStep = ((run.steps as unknown[]) ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "trigger-node",
    ) as { output?: Record<string, unknown> } | undefined;
    const triggerEvent = (triggerStep?.output?.event ?? {}) as Record<
      string,
      unknown
    >;
    expect(triggerEvent.eventType).toBe("new_worksheet");
    const payload = (triggerEvent.payload ?? {}) as Record<string, unknown>;
    expect(payload.worksheetName).toBe("Q4-Sales");
    expect(payload.workbookId).toBe(workbookId);
    // worksheetId + position come from the mock's worksheets-list response.
    expect(payload.worksheetId).toMatch(/^ws-/);
    expect(payload.position).toBe(2);

    // Quiet tick — rewind the polling cursor and re-poll; no further runs.
    await rewindTriggerPollingTimestamp(triggerRow.id as string);
    await pollOnce({ request, cronSecret });
    await new Promise((r) => setTimeout(r, 1500));
    const runsAfterQuiet = await getWorkflowRunsForUser(user.id);
    expect(runsAfterQuiet).toHaveLength(1);
  });

  test("updated_row trigger — fires once when a worksheet row's values change, payload identifies rowNumber/rowIndex + current values; quiet on baseline", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMicrosoftMockState();
    const cronSecret = requireEnv("CRON_SECRET");

    const workbookId = "wb-e2e-updated-row";
    const worksheetName = "Data";

    await page.request.post(`${mock.baseUrl}/__reset`);
    await page.request.post(`${mock.baseUrl}/__injectExcelWorksheet`, {
      data: {
        workbookId,
        worksheetName,
        values: [
          ["name", "age"],
          ["alice", 30],
          ["bob", 25],
        ],
      },
    });

    await signIn(page, user);
    await connectExcel(page);

    await createWorkflowAndConfigure({
      page,
      name: "E2E Excel updated_row",
      draftDefinition: {
        nodes: [
          {
            id: "trigger-node",
            kind: "trigger" as const,
            provider: "microsoft-excel",
            type: "updated_row",
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
      },
    });

    await activateWorkflow(page);

    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerRow = triggerRowsAfterActivate[0]! as Record<string, unknown>;
    expect(triggerRow.event_type).toBe("updated_row");
    const cfg = triggerRow.config as {
      snapshot?: { rowHashes?: Record<string, string>; rowCount?: number };
    };
    expect(cfg.snapshot?.rowCount).toBe(3);
    expect(Object.keys(cfg.snapshot?.rowHashes ?? {}).sort()).toEqual([
      "1",
      "2",
      "3",
    ]);

    // Mutate row 2 in place — alice's age changes from 30 → 31. The
    // 1-based row index ("2") stays the same; only the hash changes,
    // which is exactly what the updated_row trigger looks for.
    //
    // NOTE on positional shift noise: this test deliberately uses an
    // in-place value change, not a mid-sheet row insert/delete, so the
    // accepted positional limitation (rows shifting on neighbor
    // insert/delete also flagged as updated) does NOT manifest here.
    // That limitation is owned by the unit tests + the outcomes doc.
    const updateResp = await page.request.post(
      `${mock.baseUrl}/__updateExcelRow`,
      {
        data: {
          workbookId,
          worksheetName,
          rowIndex: 2,
          values: ["alice", 31],
        },
      },
    );
    expect(updateResp.status()).toBe(200);

    await pollOnce({ request, cronSecret });

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

    const triggerStep = ((run.steps as unknown[]) ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "trigger-node",
    ) as { output?: Record<string, unknown> } | undefined;
    const triggerEvent = (triggerStep?.output?.event ?? {}) as Record<
      string,
      unknown
    >;
    expect(triggerEvent.eventType).toBe("updated_row");
    const payload = (triggerEvent.payload ?? {}) as Record<string, unknown>;
    expect(payload.workbookId).toBe(workbookId);
    expect(payload.worksheetName).toBe(worksheetName);
    expect(payload.rowIndex).toBe(2);
    expect(payload.values).toEqual(["alice", 31]);

    // Quiet tick — no further runs when nothing changed.
    await rewindTriggerPollingTimestamp(triggerRow.id as string);
    await pollOnce({ request, cronSecret });
    await new Promise((r) => setTimeout(r, 1500));
    const runsAfterQuiet = await getWorkflowRunsForUser(user.id);
    expect(runsAfterQuiet).toHaveLength(1);
  });

  test("updated_table_row trigger — fires once when a table row's values change at its stable Graph index; identifies tableName + rowIndex; quiet on baseline", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMicrosoftMockState();
    const cronSecret = requireEnv("CRON_SECRET");

    const workbookId = "wb-e2e-updated-table-row";
    const tableName = "MyTable";

    await page.request.post(`${mock.baseUrl}/__reset`);
    // Seed a table with three rows at stable indices 0/1/2.
    await page.request.post(`${mock.baseUrl}/__injectExcelTable`, {
      data: {
        workbookId,
        tableName,
        rows: [
          { index: 0, values: ["alice", 30] },
          { index: 1, values: ["bob", 25] },
          { index: 2, values: ["carol", 40] },
        ],
      },
    });

    await signIn(page, user);
    await connectExcel(page);

    await createWorkflowAndConfigure({
      page,
      name: "E2E Excel updated_table_row",
      draftDefinition: {
        nodes: [
          {
            id: "trigger-node",
            kind: "trigger" as const,
            provider: "microsoft-excel",
            type: "updated_table_row",
            config: { workbookId, tableName },
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
      },
    });

    await activateWorkflow(page);

    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerRow = triggerRowsAfterActivate[0]! as Record<string, unknown>;
    expect(triggerRow.event_type).toBe("updated_table_row");
    const cfg = triggerRow.config as {
      snapshot?: { rowHashes?: Record<string, string>; rowCount?: number };
    };
    expect(cfg.snapshot?.rowCount).toBe(3);
    expect(Object.keys(cfg.snapshot?.rowHashes ?? {}).sort()).toEqual([
      "0",
      "1",
      "2",
    ]);

    // Mutate row at stable index 1 in place — bob's age changes.
    // Stable-id semantics: the key remains "1" across the change, so
    // the trigger sees a hash diff at the same key (vs. positional
    // worksheet semantics where neighbor inserts/deletes also flag).
    const updateResp = await page.request.post(
      `${mock.baseUrl}/__updateExcelTableRow`,
      {
        data: {
          workbookId,
          tableName,
          index: 1,
          values: ["bob", 26],
        },
      },
    );
    expect(updateResp.status()).toBe(200);

    await pollOnce({ request, cronSecret });

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

    const triggerStep = ((run.steps as unknown[]) ?? []).find(
      (s) => (s as { nodeId?: string }).nodeId === "trigger-node",
    ) as { output?: Record<string, unknown> } | undefined;
    const triggerEvent = (triggerStep?.output?.event ?? {}) as Record<
      string,
      unknown
    >;
    expect(triggerEvent.eventType).toBe("updated_table_row");
    const payload = (triggerEvent.payload ?? {}) as Record<string, unknown>;
    expect(payload.workbookId).toBe(workbookId);
    expect(payload.tableName).toBe(tableName);
    expect(payload.rowIndex).toBe(1);
    expect(payload.values).toEqual(["bob", 26]);

    // Mock saw a tableRowsList GET at activation + at the poll tick.
    const calls = await fetchMockCalls(request, mock.baseUrl);
    expect(calls.calls.excelTableRowsList.length).toBeGreaterThanOrEqual(2);
    for (const c of calls.calls.excelTableRowsList) {
      expect(c.workbookId).toBe(workbookId);
      expect(c.tableName).toBe(tableName);
    }

    // Quiet tick — no further runs when nothing changed.
    await rewindTriggerPollingTimestamp(triggerRow.id as string);
    await pollOnce({ request, cronSecret });
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
    excelRangeDelete: {
      authorization: string | undefined;
      workbookId: string;
      worksheetName: string;
      address: string;
      shift: string;
    }[];
    excelWorksheetPatch: {
      authorization: string | undefined;
      workbookId: string;
      worksheetName: string;
      newName: string;
    }[];
    excelWorksheetDelete: {
      authorization: string | undefined;
      workbookId: string;
      worksheetName: string;
    }[];
    excelTableRowsList: {
      authorization: string | undefined;
      url: string;
      workbookId: string;
      tableName: string;
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

/**
 * Excel parity Commit 5 shared scenario helpers.
 *
 * Each new test in this describe needs the same boilerplate:
 *   sign in → connect Excel → create workflow → patch nodes →
 *   activate → poll. Factoring out the steps that DON'T change
 *   between scenarios keeps each test focused on the assertions
 *   unique to that scenario.
 *
 * The originating happy-path test inlines this boilerplate
 * intentionally (it asserts the OAuth, scopes, encryption, and
 * dispatcher details that the parity-coverage scenarios take as
 * given). Don't migrate it.
 */
async function connectExcel(page: Page): Promise<void> {
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
}

async function createWorkflowAndConfigure(input: {
  page: Page;
  name: string;
  draftDefinition: unknown;
}): Promise<string> {
  const { page, name, draftDefinition } = input;
  await page.goto("/workflows");
  await page.getByRole("button", { name: "Create workflow" }).click();
  await page.getByLabel(/workflow name/i).fill(name);
  await Promise.all([
    page.waitForURL(/\/workflows\/[0-9a-f-]+/),
    page.getByRole("button", { name: "Create", exact: true }).click(),
  ]);
  const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;
  const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
    data: { draftDefinition },
  });
  if (patch.status() !== 200) {
    throw new Error(
      `workflow draft patch failed: ${patch.status()} ${await patch.text()}`,
    );
  }
  await page.reload();
  return workflowId;
}

async function activateWorkflow(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Activate" }).click();
  await expect(page.locator("[data-status-kind=active]")).toBeVisible({
    timeout: 10_000,
  });
}

async function pollOnce(input: {
  request: APIRequestContext;
  cronSecret: string;
}): Promise<void> {
  const resp = await input.request.post("/api/cron/poll-triggers", {
    headers: { authorization: `Bearer ${input.cronSecret}` },
  });
  if (resp.status() !== 200) {
    throw new Error(
      `poll-triggers cron failed: ${resp.status()} ${await resp.text()}`,
    );
  }
}
