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
import { readAirtableMockState } from "./global-setup";

/**
 * Slice 10 end-to-end walkthrough — Airtable.
 *
 * V2's first non-Google / non-Microsoft REFRESHABLE OAuth provider AND
 * the first webhook-with-cursor-payload-fetch trigger primitive.
 *
 * Real surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in).
 *   - OAuth dispatcher / state / atomic consume against the standard
 *     `[provider]` route. Airtable uses PKCE (S256) + HTTP Basic auth +
 *     form-encoded body — the mock validates all three.
 *   - Token encryption (AES-256-GCM) + integration row writeback.
 *   - userId resolution from /v0/meta/whoami.
 *   - Workflow create + activate (record_changed trigger registration).
 *   - Trigger activation: webhook create POST → trigger_resources row
 *     stores `baseId`, `webhookId`, `macSecretBase64`, `expiresAt`,
 *     `lastCursor: null`, `type: "subscription-watch"`.
 *   - Webhook receive: signature verify (X-Airtable-Content-MAC over raw
 *     body) → trigger lookup → cursor-paged payload fetch → cursor
 *     advance BEFORE event dispatch → normalize → dispatch.
 *   - Engine + create_record action handler → POST /v0/{baseId}/{table}
 *     with the decrypted bearer token.
 *   - DB-backed dedup (webhook_event_dedup) catches duplicate eventIds.
 *   - Cursor-advance correctness: a second ping with no new injected
 *     payloads returns zero events from the mock → no duplicate run.
 *
 * Mocked surfaces (Airtable network boundary only):
 *   - airtable.com/oauth2/v1/{authorize,token}
 *   - api.airtable.com/v0/meta/whoami, /v0/meta/bases/{id}/tables
 *   - api.airtable.com/v0/{base}/{table}{,/recordId} (records CRUD)
 *   - api.airtable.com/v0/bases/{baseId}/webhooks{,/refresh,/payloads}
 *
 * Refresh-token rotation is NOT exercised in this e2e — Airtable's
 * rotation invariant is covered by 5 dedicated unit tests in
 * `tests/unit/integrations/airtable/oauth.test.ts`. Adding it here
 * would require triggering a 401 mid-action, which complicates the
 * mock without proving more than the unit tests already do.
 *
 * Key Airtable-specific assertions:
 *   - Authorize URL includes `code_challenge` + `code_challenge_method=S256`.
 *   - Token exchange body includes `code_verifier` (PKCE proof).
 *   - Token exchange uses HTTP Basic auth + application/x-www-form-urlencoded.
 *   - Refresh token IS persisted (distinct from Notion which drops it).
 *   - Webhook receive signature verification: invalid sig → 401; missing
 *     header → 401.
 *   - Cursor advances before dispatch — second ping with no new
 *     injected payloads produces zero events (cursor-advance correctness).
 */

let testUser: TestUser | null = null;

test.describe("Slice 10 — full Airtable walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Airtable → build + activate (creates webhook) → ping → succeeded run → invalid-sig 401 → replay returns zero events (cursor advance) → dedup row written", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readAirtableMockState();

    // Per-run unique recordId so webhook_event_dedup never collides
    // across consecutive runs. Same caveat as Slice 8: the mock resets
    // its counters on /__reset; webhook_event_dedup is system-wide and
    // doesn't cascade with deleteTestUser. The webhookId also resets
    // (mock counter starts at 1 after each /__reset), so we make the
    // dedup-key recordId-segment unique to keep eventIds distinct.
    const recordId = `recE2E-${randomUUID()}`;

    // Reset mock so per-test assertions are scoped to this run.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect Airtable ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=airtable/),
      page
        .getByRole("button", { name: "Connect Airtable", exact: true })
        .click(),
    ]);

    // After OAuth: integrations page shows Airtable connected.
    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // ── 4. DB assertions: integration row exists with encrypted tokens ──
    const integrations = await getIntegrationsForUser(user.id, "airtable");
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]! as Record<string, unknown>;

    // accountId is the whoami `id`.
    expect(integration.provider_account_id).toBe("usrL2PNC5o3H4lBEi");

    // Access token + refresh token are both encrypted (NOT plaintext mock values).
    expect(integration.access_token_encrypted).toBeTruthy();
    expect(integration.access_token_encrypted).not.toBe(
      "airtable-mock-e2e-access",
    );
    expect(integration.refresh_token_encrypted).toBeTruthy();
    expect(integration.refresh_token_encrypted).not.toBe(
      "airtable-mock-e2e-refresh-1",
    );

    // Scopes echoed by mock — exactly the four Slice 10 Batch 1 scopes.
    const scopes = integration.scopes as readonly string[];
    expect(scopes).toEqual(
      expect.arrayContaining([
        "data.records:read",
        "data.records:write",
        "schema.bases:read",
        "webhook:manage",
      ]),
    );

    // OAuth state row was atomically consumed — total count back to baseline.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // ── 5. Mock-call assertions: authorize + token + whoami ──
    const callsAfterOAuth = await fetchAirtableCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.whoami).toHaveLength(1);

    const authorizeCall = callsAfterOAuth.calls.authorize[0]!;
    // PKCE proof: code_challenge + S256.
    expect(authorizeCall.codeChallenge).toBeTruthy();
    expect(authorizeCall.codeChallengeMethod).toBe("S256");
    expect(authorizeCall.responseType).toBe("code");
    expect(authorizeCall.scope).toBe(
      "data.records:read data.records:write schema.bases:read webhook:manage",
    );
    expect(authorizeCall.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/airtable\/callback$/,
    );

    // Token exchange used HTTP Basic auth + form-encoded body.
    const tokenCall = callsAfterOAuth.calls.tokenExchange[0]!;
    expect(tokenCall.authorization).toMatch(/^Basic /);
    const expectedAuth = `Basic ${Buffer.from(
      `${process.env.AIRTABLE_CLIENT_ID ?? "e2e-airtable-client-id"}:${process.env.AIRTABLE_CLIENT_SECRET ?? "e2e-airtable-client-secret"}`,
    ).toString("base64")}`;
    expect(tokenCall.authorization).toBe(expectedAuth);
    expect(tokenCall.contentType).toContain(
      "application/x-www-form-urlencoded",
    );
    expect(tokenCall.parsedBody.grant_type).toBe("authorization_code");
    // PKCE proof: code_verifier was sent.
    expect(tokenCall.parsedBody.code_verifier).toBeTruthy();
    expect(tokenCall.parsedBody.redirect_uri).toMatch(
      /\/api\/integrations\/oauth\/airtable\/callback$/,
    );
    // Body MUST NOT carry client_id/client_secret — those are in the
    // Basic auth header.
    expect(tokenCall.parsedBody.client_id).toBeUndefined();
    expect(tokenCall.parsedBody.client_secret).toBeUndefined();

    // /v0/meta/whoami called with the new access token.
    expect(callsAfterOAuth.calls.whoami[0]!.authorization).toBe(
      "Bearer airtable-mock-e2e-access",
    );

    // ── 6. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill("E2E Airtable Walkthrough");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 7. Configure trigger + action via API patch ──
    // Trigger watches appBASE/tblTASKS for record changes.
    // Action creates a record in appBASE/Logs (different table) so the
    // POST is unambiguously the action's effect, not the trigger's
    // payload feed.
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "airtable",
          type: "record_changed",
          config: {
            baseId: "appBASE",
            tableIdOrName: "tblTASKS",
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "airtable",
          type: "create_record",
          config: {
            baseId: "appBASE",
            tableIdOrName: "Logs",
            typecast: false,
            fields: {
              Message: {
                type: "singleLineText",
                value: "Echo from Airtable trigger",
              },
              Acknowledged: { type: "checkbox", value: false },
            },
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

    // ── 8. Activate workflow via UI ──
    // Triggers Airtable's activate hook: POST /v0/bases/appBASE/webhooks
    // with notificationUrl + tableData spec + recordChangeScope.
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // ── 9. trigger_resources row stores webhook metadata ──
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    expect(triggerAfterActivate.provider).toBe("airtable");
    expect(triggerAfterActivate.event_type).toBe("record_changed");
    const configAfterActivate = triggerAfterActivate.config as {
      type?: string;
      webhookEnabled?: boolean;
      baseId?: string;
      tableIdOrName?: string;
      webhookId?: string;
      macSecretBase64?: string;
      expiresAt?: string;
      lastCursor?: number | null;
      notificationUrl?: string;
    };
    expect(configAfterActivate.type).toBe("subscription-watch");
    expect(configAfterActivate.webhookEnabled).toBe(true);
    expect(configAfterActivate.baseId).toBe("appBASE");
    expect(configAfterActivate.tableIdOrName).toBe("tblTASKS");
    expect(configAfterActivate.webhookId).toBeTruthy();
    expect(configAfterActivate.macSecretBase64).toBeTruthy();
    // 32-byte mac → 44-char base64.
    expect(configAfterActivate.macSecretBase64!.length).toBeGreaterThanOrEqual(
      40,
    );
    expect(configAfterActivate.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(configAfterActivate.expiresAt!).getTime()).toBeGreaterThan(
      Date.now(),
    );
    // First fetch will omit cursor — Airtable defaults to feed start.
    expect(configAfterActivate.lastCursor).toBeNull();

    // Mock saw exactly 1 webhookCreate call with the right scope.
    const callsAfterActivate = await fetchAirtableCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.webhookCreate).toHaveLength(1);
    const webhookCreateCall = callsAfterActivate.calls.webhookCreate[0]!;
    expect(webhookCreateCall.baseId).toBe("appBASE");
    expect(webhookCreateCall.responseWebhookId).toBe(
      configAfterActivate.webhookId,
    );
    // Spec includes recordChangeScope = tblTASKS + dataTypes = ["tableData"].
    const spec = webhookCreateCall.body.specification as {
      options?: { filters?: Record<string, unknown> };
    } | null;
    expect(spec?.options?.filters).toEqual({
      dataTypes: ["tableData"],
      recordChangeScope: "tblTASKS",
    });
    // notificationUrl carries diagnostic workflowId + nodeId query params
    // and points back at V2's webhook receive route.
    expect(String(webhookCreateCall.body.notificationUrl)).toMatch(
      /\/api\/webhooks\/airtable\?/,
    );
    expect(String(webhookCreateCall.body.notificationUrl)).toContain(
      `nodeId=trigger-node`,
    );

    // ── 10. Invalid-signature ping → 401, no run, no action ──
    const invalidResp = await page.request.post(
      `${mock.baseUrl}/__sendInvalidSignaturePing`,
      { data: { webhookId: configAfterActivate.webhookId } },
    );
    expect(invalidResp.status()).toBe(200);
    const invalidBody = (await invalidResp.json()) as {
      status: number;
      body: string;
    };
    expect(invalidBody.status).toBe(401);

    // Brief wait to confirm NO run was enqueued.
    await new Promise((r) => setTimeout(r, 500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(0);
    const callsAfterInvalid = await fetchAirtableCalls(request, mock.baseUrl);
    // No payload listing happened — signature gate runs first.
    expect(callsAfterInvalid.calls.webhookListPayloads).toHaveLength(0);
    // No action call either.
    expect(
      callsAfterInvalid.calls.records.filter((r) => r.method === "POST"),
    ).toHaveLength(0);

    // ── 11. Inject a record change + signed ping ──
    const inject1 = await page.request.post(
      `${mock.baseUrl}/__injectRecordChange`,
      {
        data: {
          webhookId: configAfterActivate.webhookId,
          tableId: "tblTASKS",
          recordId,
          eventType: "created",
          fields: { fldNAME: "Alice" },
        },
      },
    );
    expect(inject1.status()).toBe(200);
    const inject1Body = (await inject1.json()) as {
      ok: boolean;
      baseTransactionNumber: number;
    };
    expect(inject1Body.ok).toBe(true);
    expect(inject1Body.baseTransactionNumber).toBe(1);

    const ping1 = await page.request.post(`${mock.baseUrl}/__sendWebhookPing`, {
      data: { webhookId: configAfterActivate.webhookId },
    });
    expect(ping1.status()).toBe(200);
    const ping1Body = (await ping1.json()) as { status: number; body: string };
    expect(ping1Body.status).toBe(200);

    // ── 12. workflow_run succeeds ──
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

    // ── 13. Mock saw exactly 1 listPayloads + 1 records POST (action) ──
    const callsAfterRun = await fetchAirtableCalls(request, mock.baseUrl);
    expect(callsAfterRun.calls.webhookListPayloads).toHaveLength(1);
    const listCall1 = callsAfterRun.calls.webhookListPayloads[0]!;
    // First call had cursor=null/undefined (omitted; Airtable starts at 0).
    expect(listCall1.cursor).toBeNull();
    expect(listCall1.responsePayloadCount).toBe(1);
    expect(listCall1.responseCursor).toBe(1);
    // Authorization carries the (decrypted) bearer access token.
    expect(listCall1.authorization).toBe(
      "Bearer airtable-mock-e2e-access",
    );

    // Action: exactly 1 POST to /v0/appBASE/Logs with the wire-format
    // fields (singleLineText + checkbox passthrough).
    const recordPosts = callsAfterRun.calls.records.filter(
      (r) => r.method === "POST",
    );
    expect(recordPosts).toHaveLength(1);
    const actionCall = recordPosts[0]!;
    expect(actionCall.baseId).toBe("appBASE");
    expect(actionCall.tableIdOrName).toBe("Logs");
    expect(actionCall.authorization).toBe(
      "Bearer airtable-mock-e2e-access",
    );
    expect(actionCall.body).toEqual({
      fields: {
        Message: "Echo from Airtable trigger",
        Acknowledged: false,
      },
      typecast: false,
    });

    // ── 14. trigger_resources cursor advanced to 1 BEFORE return ──
    // (asserted via DB; pull persists the cursor before emitting events)
    const triggerRowsAfterRun = await getTriggerResourcesForUser(user.id);
    const configAfterRun = (
      triggerRowsAfterRun[0]! as Record<string, unknown>
    ).config as { lastCursor?: number };
    expect(configAfterRun.lastCursor).toBe(1);

    // ── 15. Dedup row written ──
    // eventId = `${webhookId}:tblTASKS:${recordId}:created:1`
    const dedupEventId = `${configAfterActivate.webhookId}:tblTASKS:${recordId}:created:1`;
    const dedupRow = await getDedupRow("airtable", dedupEventId);
    expect(dedupRow).not.toBeNull();

    // ── 16. UI: Run history shows the succeeded run ──
    await page.reload();
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i)).toBeVisible();

    // ── 17. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ── 18. Replay: same ping body, signature still valid ──
    // Cursor on V2's side is now 1; mock has 1 payload at index 0; the
    // listPayloads call with cursor=1 returns 0 payloads → no event,
    // no second run, no second action call. This validates the
    // cursor-advance-before-return correctness invariant.
    const replayResp = await page.request.post(
      `${mock.baseUrl}/__replayLastWebhookPing`,
    );
    expect(replayResp.status()).toBe(200);
    const replayBody = (await replayResp.json()) as {
      status: number;
      body: string;
    };
    expect(replayBody.status).toBe(200);

    await new Promise((r) => setTimeout(r, 1500));

    const runsAfterReplay = await getWorkflowRunsForUser(user.id);
    expect(runsAfterReplay).toHaveLength(1);

    const callsAfterReplay = await fetchAirtableCalls(request, mock.baseUrl);
    // Two listPayloads calls total; the second was cursor=1 → 0 payloads.
    expect(callsAfterReplay.calls.webhookListPayloads).toHaveLength(2);
    const listCall2 = callsAfterReplay.calls.webhookListPayloads[1]!;
    expect(listCall2.cursor).toBe("1");
    expect(listCall2.responsePayloadCount).toBe(0);
    expect(listCall2.responseCursor).toBe(1);

    // Action POST count stayed at 1 — load-bearing assertion that
    // cursor-advance prevents replay.
    const recordPostsAfterReplay = callsAfterReplay.calls.records.filter(
      (r) => r.method === "POST",
    );
    expect(recordPostsAfterReplay).toHaveLength(1);
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

interface AirtableMockInspect {
  calls: {
    authorize: {
      state: string;
      redirectUri: string | null;
      responseType: string | null;
      scope: string | null;
      codeChallenge: string | null;
      codeChallengeMethod: string | null;
    }[];
    tokenExchange: {
      authorization: string | undefined;
      contentType: string | undefined;
      body: string;
      parsedBody: Record<string, string>;
    }[];
    whoami: {
      authorization: string | undefined;
      url: string;
    }[];
    records: {
      method: string;
      authorization: string | undefined;
      baseId: string;
      tableIdOrName: string;
      recordId: string | null;
      url: string;
      body: Record<string, unknown> | null;
      responseRecordId: string | null;
    }[];
    schema: { authorization: string | undefined; baseId: string }[];
    webhookCreate: {
      authorization: string | undefined;
      baseId: string;
      body: Record<string, unknown>;
      responseWebhookId: string;
    }[];
    webhookDelete: {
      authorization: string | undefined;
      baseId: string;
      webhookId: string;
    }[];
    webhookRefresh: {
      authorization: string | undefined;
      baseId: string;
      webhookId: string;
    }[];
    webhookListPayloads: {
      authorization: string | undefined;
      baseId: string;
      webhookId: string;
      cursor: string | null;
      responsePayloadCount: number;
      responseCursor: number;
      responseMightHaveMore: boolean;
    }[];
    webhookPing: {
      webhookId: string;
      url: string;
      status: number;
      body: string;
    }[];
  };
  webhooks: Array<{
    id: string;
    baseId: string;
    notificationUrl: string;
    macSecretBase64: string;
    expirationTime: string;
    payloadCount: number;
  }>;
  recordIds: string[];
}

async function fetchAirtableCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<AirtableMockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as AirtableMockInspect;
}
