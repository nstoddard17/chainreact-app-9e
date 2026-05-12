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
import { readTrelloMockState } from "./global-setup";

/**
 * Slice 17 end-to-end walkthrough — Trello.
 *
 * V2's FIRST token-ingest provider. Trello's "client authorization"
 * flow returns a per-user token in the URL **fragment**, not via a
 * server callback. The dispatcher's `handleTokenIngest` operation
 * accepts the fragment-captured token from a V2 client page and
 * verifies it server-side against /1/members/me before persisting.
 *
 * Real V2 surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in).
 *   - Token-ingest dispatcher path: `createState` → JWT → Trello
 *     authorize → fragment-redirect → V2 client ingest page →
 *     POST /api/integrations/oauth/trello/ingest → `consumeState`
 *     (atomic delete-if-fresh) → `verifyAndIngestToken` (calls Trello
 *     `GET /1/members/me`) → encrypt + `upsertActive`.
 *   - Token encryption (AES-256-GCM) — no refresh token (Trello
 *     tokens don't refresh).
 *   - Per-(workflow, node) webhook lifecycle: `POST /1/webhooks` with
 *     `idModel = boardId`, stored `webhookId` in
 *     `trigger_resources.config`.
 *   - Webhook receive: X-Trello-Webhook verify (HMAC-SHA1-base64 over
 *     rawBody+callbackURL keyed with TRELLO_CLIENT_SECRET) →
 *     strict-direct trigger lookup via `?workflowId=X&nodeId=Y` →
 *     classify action.type → filter by trigger's stored eventType →
 *     normalize → dispatch.
 *   - Engine + create_card action handler → POST /1/cards with
 *     `?key=&token=` URL-param auth (NOT Bearer).
 *   - DB-backed dedup (webhook_event_dedup) catches duplicate
 *     action.id deliveries.
 *
 * Mocked surfaces (Trello network boundary only):
 *   - /1/authorize  (302-with-fragment redirect)
 *   - /1/members/me
 *   - /1/cards      (create_card action)
 *   - /1/webhooks{,/id} (lifecycle)
 *
 * Key Trello-specific assertions:
 *   - Authorize URL omits PKCE / code / state-as-callback-query
 *     (Trello uses `response_type=token` + `callback_method=fragment`).
 *   - `return_url` carries V2's `state` query param so the client
 *     page can POST it back.
 *   - Token-ingest endpoint cross-checks JWT user against session
 *     user (stricter than OAuth callback).
 *   - `verifyAndIngestToken` calls `/1/members/me` with key + token
 *     query params (NOT Bearer header — Trello rejects Bearer).
 *   - Integration row: encrypted token, refresh null, scopes [],
 *     accountId = Trello member id (immutable), metadata.username +
 *     fullName + avatarUrl.
 *   - `trigger_resources.config` carries webhookId + boardId +
 *     eventType + callbackURL + webhookEnabled — NO
 *     `type: "subscription-watch"` (Trello webhooks don't expire).
 *   - Webhook lifecycle uses the user's access token via URL-param
 *     auth on POST /1/webhooks (not Bearer).
 *   - Action call uses `?key=&token=` URL-param auth.
 *   - Invalid signature → 401, no run.
 *   - Board mismatch → 200 ack, no run, no action.
 *   - Unsupported Trello action type → 200 ack, no run, no action.
 *   - Replay of same signed event (same action.id) → no duplicate run
 *     (webhook_event_dedup catches via Trello action id as
 *     `TriggerEvent.eventId`).
 */

const APP_KEY = "e2e-trello-client-id";
const MEMBER_ID = "trello-mock-member-id";
const MOCK_USER_TOKEN = "trello-mock-e2e-user-token";
const BOARD_ID = "board-mock-1";
const LIST_ID = "list-mock-target";

let testUser: TestUser | null = null;

test.describe("Slice 17 — full Trello walkthrough", () => {
  // Token-ingest authorize → fragment-redirect → client-page POST →
  // verify → activate webhook → 4 event paths (invalid sig / board
  // mismatch / unsupported action / valid signed) → replay dedup
  // exercises ~20 server round-trips total. Default 30s isn't enough.
  test.setTimeout(120_000);

  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Trello via token-ingest → assert auth/integration → build + activate new_card workflow → invalid-sig 401 → board-mismatch ack → unsupported-action ack → signed createCard → succeeded run (create_card) → replay deduped", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readTrelloMockState();
    const runMarker = randomUUID();

    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. POST /connect — receive Trello authorize URL ──
    const connectResp = await page.request.post(
      "/api/integrations/oauth/trello/connect",
    );
    expect(connectResp.status(), await connectResp.text()).toBe(200);
    const { redirectUrl } = (await connectResp.json()) as {
      redirectUrl: string;
    };
    expect(redirectUrl).toContain("/1/authorize");

    // Parse the authorize URL: state is preserved as a query param on
    // return_url (Trello's fragment-mode redirect echoes it back via
    // the same URL the browser visits).
    const authorizeUrl = new URL(redirectUrl);
    expect(authorizeUrl.pathname).toBe("/1/authorize");
    expect(authorizeUrl.searchParams.get("key")).toBe(APP_KEY);
    expect(authorizeUrl.searchParams.get("callback_method")).toBe("fragment");
    expect(authorizeUrl.searchParams.get("response_type")).toBe("token");
    expect(authorizeUrl.searchParams.get("scope")).toBe("read,write,account");
    expect(authorizeUrl.searchParams.get("expiration")).toBe("never");
    expect(authorizeUrl.searchParams.get("name")).toBe("ChainReact");
    const returnUrlParam = authorizeUrl.searchParams.get("return_url");
    expect(returnUrlParam).toBeTruthy();
    const returnUrl = new URL(returnUrlParam!);
    expect(returnUrl.pathname).toBe("/integrations/token-ingest/trello");
    const state = returnUrl.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(state!.length).toBeGreaterThan(20);

    // ── 4. Navigate to Trello authorize URL → mock issues 302 with
    //       fragment → browser lands on V2 client ingest page → its JS
    //       reads fragment + POSTs to /ingest → page navigates back ──
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=trello/, {
        timeout: 15_000,
      }),
      page.goto(redirectUrl),
    ]);

    // Authorize page recorded the request
    const inspectAfterAuth = await fetchInspect(request, mock.baseUrl);
    expect(inspectAfterAuth.calls.authorize).toHaveLength(1);
    expect(inspectAfterAuth.calls.authorize[0]!.key).toBe(APP_KEY);

    // Members.me was called server-side during token-ingest verify
    expect(inspectAfterAuth.calls.membersMe).toHaveLength(1);
    expect(inspectAfterAuth.calls.membersMe[0]!.key).toBe(APP_KEY);
    expect(inspectAfterAuth.calls.membersMe[0]!.token).toBe(MOCK_USER_TOKEN);

    // ── 5. Integrations page shows Trello connected ──
    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // ── 6. Integration row: encrypted token + Trello member info ──
    const integrations = await getIntegrationsForUser(user.id, "trello");
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]! as Record<string, unknown>;

    // accountId = Trello member id from /1/members/me (immutable)
    expect(integration.provider_account_id).toBe(MEMBER_ID);

    // Encrypted blob, NOT the plaintext mock token
    expect(integration.access_token_encrypted).toBeTruthy();
    expect(integration.access_token_encrypted).not.toBe(MOCK_USER_TOKEN);
    // Refresh token NULL — Trello tokens don't refresh (anti-test)
    expect(integration.refresh_token_encrypted).toBeNull();
    // Trello tokens with `expiration=never` don't expire
    expect(integration.access_token_expires_at).toBeNull();

    // Scopes empty — Trello's authorize response doesn't echo scopes;
    // manifest documents them but they're not surfaced on the row.
    const scopes = integration.scopes as readonly string[];
    expect(scopes).toEqual([]);

    // Metadata derived from verified /1/members/me response
    const metadata = integration.account_metadata as Record<string, unknown>;
    expect(metadata.username).toBe("octocat-trello-e2e");
    expect(metadata.fullName).toBe("Octo Trello E2E");
    expect(typeof metadata.avatarUrl).toBe("string");

    // OAuth state row was atomically consumed
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // ── 7. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page.getByLabel(/workflow name/i).fill("E2E Trello Walkthrough");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 8. Configure trigger + action via API patch ──
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "trello",
          type: "new_card",
          config: {
            boardId: BOARD_ID,
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "trello",
          type: "create_card",
          config: {
            listId: LIST_ID,
            name: `E2E Card ${runMarker}`,
            desc: "Created from the Slice 17 walkthrough.",
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

    // ── 9. Activate workflow → creates ONE Trello webhook ──
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.locator("[data-status-kind=active]")).toBeVisible({
      timeout: 10_000,
    });

    // ── 10. trigger_resources stores webhook metadata ──
    const triggerRows = await getTriggerResourcesForUser(user.id);
    expect(triggerRows).toHaveLength(1);
    const trigger = triggerRows[0]! as Record<string, unknown>;
    expect(trigger.provider).toBe("trello");
    expect(trigger.event_type).toBe("new_card");
    const config = trigger.config as {
      type?: string;
      webhookEnabled?: boolean;
      boardId?: string;
      eventType?: string;
      webhookId?: string;
      callbackURL?: string;
      notificationUrl?: string;
    };
    expect(config.type).toBeUndefined(); // no subscription-watch marker
    expect(config.webhookEnabled).toBe(true);
    expect(config.boardId).toBe(BOARD_ID);
    expect(config.eventType).toBe("new_card");
    expect(typeof config.webhookId).toBe("string");
    expect(config.webhookId!.length).toBeGreaterThan(0);
    expect(config.callbackURL).toMatch(/\/api\/webhooks\/trello\?/);
    expect(config.callbackURL).toContain("nodeId=trigger-node");
    expect(config.callbackURL).toContain(`workflowId=${workflowId}`);

    // Mock saw exactly 1 webhook create with URL-param auth
    const inspectAfterActivate = await fetchInspect(request, mock.baseUrl);
    expect(inspectAfterActivate.calls.webhookCreate).toHaveLength(1);
    const createCall = inspectAfterActivate.calls.webhookCreate[0]!;
    expect(createCall.key).toBe(APP_KEY);
    expect(createCall.token).toBe(MOCK_USER_TOKEN);
    expect(createCall.idModel).toBe(BOARD_ID);
    expect(createCall.callbackURL).toContain(`workflowId=${workflowId}`);
    expect(createCall.callbackURL).toContain("nodeId=trigger-node");
    expect(createCall.parsedBody.description).toContain("new_card");
    expect(createCall.parsedBody.description).toContain(workflowId);

    const webhookId = config.webhookId!;

    // ── 11. Invalid-signature event → 401, no run ──
    const invalidResp = await page.request.post(
      `${mock.baseUrl}/__sendInvalidSignatureEvent`,
      { data: { webhookId } },
    );
    expect(invalidResp.status()).toBe(200);
    const invalidBody = (await invalidResp.json()) as {
      status: number;
      body: string;
    };
    expect(invalidBody.status).toBe(401);

    await new Promise((r) => setTimeout(r, 500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(0);
    const callsAfterInvalid = await fetchInspect(request, mock.baseUrl);
    expect(callsAfterInvalid.calls.cardsCreate).toHaveLength(0);

    // ── 12. Board mismatch → 200 ack, no run ──
    const mismatchResp = await page.request.post(
      `${mock.baseUrl}/__sendBoardMismatchEvent`,
      { data: { webhookId } },
    );
    expect(mismatchResp.status()).toBe(200);
    const mismatchBody = (await mismatchResp.json()) as {
      status: number;
      body: string;
    };
    expect(mismatchBody.status).toBe(200);
    expect(mismatchBody.body).toContain("skipped");

    await new Promise((r) => setTimeout(r, 500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(0);
    const callsAfterMismatch = await fetchInspect(request, mock.baseUrl);
    expect(callsAfterMismatch.calls.cardsCreate).toHaveLength(0);

    // ── 13. Unsupported action type → 200 ack, no run ──
    // Sends a `createLabel` action — V2's classifier returns null →
    // route 200-skips without dispatch.
    const unsupportedResp = await page.request.post(
      `${mock.baseUrl}/__sendUnsupportedActionEvent`,
      { data: { webhookId } },
    );
    expect(unsupportedResp.status()).toBe(200);
    const unsupportedBody = (await unsupportedResp.json()) as {
      status: number;
      body: string;
    };
    expect(unsupportedBody.status).toBe(200);
    expect(unsupportedBody.body).toContain("skipped");

    await new Promise((r) => setTimeout(r, 500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(0);

    // ── 14. Signed createCard event matching board + trigger ──
    const actionId = `action-e2e-${runMarker}`;
    const sendResp = await page.request.post(
      `${mock.baseUrl}/__sendCreateCardEvent`,
      { data: { webhookId, actionId } },
    );
    expect(sendResp.status()).toBe(200);
    const sendBody = (await sendResp.json()) as {
      status: number;
      body: string;
      actionId: string;
    };
    expect(sendBody.status).toBe(200);
    expect(sendBody.actionId).toBe(actionId);

    // ── 15. workflow_run succeeded ──
    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      {
        description: "workflow_runs row to appear",
        timeoutMs: 15_000,
      },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as Record<string, unknown>;
    expect(run.status).toBe("succeeded");
    expect(run.error_classification).toBeNull();

    // ── 16. Mock saw exactly 1 POST /1/cards with URL-param auth ──
    const callsAfterRun = await fetchInspect(request, mock.baseUrl);
    expect(callsAfterRun.calls.cardsCreate).toHaveLength(1);
    const cardCall = callsAfterRun.calls.cardsCreate[0]!;
    expect(cardCall.method).toBe("POST");
    expect(cardCall.path).toBe("/1/cards");
    // Trello uses ?key=&token= URL-param auth (NOT Bearer header)
    expect(cardCall.key).toBe(APP_KEY);
    expect(cardCall.token).toBe(MOCK_USER_TOKEN);
    // Body shape matches workflow config
    expect(cardCall.parsedBody.idList).toBe(LIST_ID);
    expect(cardCall.parsedBody.name).toBe(`E2E Card ${runMarker}`);
    expect(cardCall.parsedBody.desc).toBe(
      "Created from the Slice 17 walkthrough.",
    );

    // ── 17. Dedup row written for Trello action id ──
    const dedupRow = await getDedupRow("trello", actionId);
    expect(dedupRow).not.toBeNull();

    // ── 18. UI: run history shows the succeeded run ──
    await page.reload();
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i)).toBeVisible();

    // ── 19. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ── 20. Replay last event → dedup blocks the duplicate run ──
    const replayResp = await page.request.post(
      `${mock.baseUrl}/__replayLastWebhookEvent`,
    );
    expect(replayResp.status()).toBe(200);
    const replayBody = (await replayResp.json()) as {
      status: number;
      body: string;
    };
    expect(replayBody.status).toBe(200);

    await new Promise((r) => setTimeout(r, 1500));

    const runsAfterReplay = await getWorkflowRunsForUser(user.id);
    expect(runsAfterReplay).toHaveLength(1); // dedup held the line

    const callsAfterReplay = await fetchInspect(request, mock.baseUrl);
    // Card POST count stayed at 1 — load-bearing assertion that
    // dedup prevents replay from triggering a second action call.
    expect(callsAfterReplay.calls.cardsCreate).toHaveLength(1);
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

interface TrelloMockInspect {
  calls: {
    authorize: Array<{
      key: string | null;
      returnUrl: string | null;
      scope: string | null;
      responseType: string | null;
      callbackMethod: string | null;
      expiration: string | null;
      name: string | null;
    }>;
    membersMe: Array<{
      key: string | null;
      token: string | null;
    }>;
    cardsCreate: Array<{
      method: string;
      path: string;
      key: string | null;
      token: string | null;
      body: string;
      parsedBody: Record<string, unknown>;
    }>;
    cardsUpdate: Array<unknown>;
    cardsAddComment: Array<unknown>;
    cardsAddLabel: Array<unknown>;
    listsCreate: Array<unknown>;
    boardsCreate: Array<unknown>;
    webhookCreate: Array<{
      key: string | null;
      token: string | null;
      body: string;
      parsedBody: Record<string, unknown>;
      idModel: string | null;
      callbackURL: string | null;
      responseWebhookId: string;
    }>;
    webhookDelete: Array<{
      webhookId: string;
      key: string | null;
      token: string | null;
    }>;
    webhookEvent: Array<{
      webhookId: string;
      url: string;
      actionType: string;
      actionId: string;
      status: number;
      responseBody: string;
    }>;
  };
  webhooks: Array<{
    id: string;
    idModel: string;
    callbackURL: string;
    description: string | null;
  }>;
}

async function fetchInspect(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<TrelloMockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as TrelloMockInspect;
}
