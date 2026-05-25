import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { createHmac } from "node:crypto";
import {
  createTestUser,
  deleteTestUser,
  getIntegrationsForUser,
  getNotificationsForUser,
  getOAuthStateRowCount,
  getWorkflowRunsForUser,
  waitFor,
  type TestUser,
} from "./helpers/supabaseAdmin";
import { readMockState, readNotionMockState } from "./global-setup";

/**
 * Slice 9 end-to-end walkthrough — Notion (actions-only).
 *
 * V2's first non-Google / non-Microsoft OAuth provider. Slice 9 ships
 * actions-only — Notion's webhook is manual-only (see
 * docs/slices/slice-9-notion.md §"Critical constraint") so this
 * walkthrough uses a Slack message trigger as the workflow entry point
 * and a Notion `create_page` action to prove the Notion handler chain
 * runs end-to-end.
 *
 * Real surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in)
 *   - OAuth dispatcher / state / atomic consume against the standard
 *     `[provider]` route — Notion is the first provider to use it
 *     without a sibling provider sharing the same client app
 *   - Notion OAuth: HTTP Basic auth + JSON body token exchange (NO
 *     PKCE, NO scope param on authorize URL — distinct from every
 *     existing V2 provider)
 *   - Token encryption (AES-256-GCM) + integration row writeback
 *   - bot_id resolution from Notion's `/v1/oauth/token` response
 *   - refresh_token from Notion's response is INTENTIONALLY DROPPED
 *     (Slice 9 scope decision — V2 treats Notion as non-refreshable)
 *   - Workflow create + activate (Slack trigger registration)
 *   - Slack webhook receive → engine dispatch → Notion `create_page`
 *     handler → Notion API wrapper → mock /v1/pages POST
 *   - refreshAndRetry on the principal Notion call (Notion is
 *     non-refreshable but the wrapper still mediates token decryption)
 *   - Property polymorphism — typed `title` + `rich_text` + `select` +
 *     `number` + `checkbox` properties coerced via formatProperties
 *
 * Mocked surfaces (Notion network boundary only):
 *   - api.notion.com/v1/oauth/{authorize,token}
 *   - api.notion.com/v1/pages (POST — create_page action)
 *
 * Slack network boundary is also mocked (see Slice 1) so the trigger
 * fires without real Slack. The Slack webhook delivery itself is a
 * real signed POST to V2's webhook receive route.
 *
 * Key Notion-specific assertions:
 *   - Authorize URL has NO `scope` param (capabilities are
 *     integration-level in Notion's developer portal).
 *   - Token exchange uses HTTP Basic auth + `application/json` body
 *     (NOT form-encoded; distinct from Slack/Microsoft/Google).
 *   - Notion-Version header is "2022-06-28" on every API call.
 *   - Authorization header on /v1/pages carries the (decrypted) bot
 *     access token.
 *   - Notion's response refresh_token is NOT reflected in the stored
 *     integration row.
 */

let testUser: TestUser | null = null;

test.describe("Slice 9 — full Notion walkthrough (actions-only)", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Slack + Notion → build workflow with Slack trigger + Notion create_page action → fire Slack webhook → succeeded run + Notion API called with correct headers/body", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const slackMock = await readMockState();
    const notionMock = await readNotionMockState();

    // Reset both mocks so per-test assertions are scoped to this run.
    await page.request.post(`${slackMock.baseUrl}/__reset`);
    await page.request.post(`${notionMock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3a. Connect Slack (the workflow trigger source) ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=slack/),
      page.getByRole("button", { name: "Connect Slack", exact: true }).click(),
    ]);

    // ── 3b. Connect Notion (the workflow action source) ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=notion/),
      page.getByRole("button", { name: "Connect Notion", exact: true }).click(),
    ]);

    // After OAuth: integrations page shows BOTH connected.
    await page.goto("/integrations");
    const connected = page
      .locator('ul[aria-label="Integrations"]')
      .getByText(/Connected/);
    await expect(connected).toHaveCount(2);

    // DB assertions: Notion integration row exists with encrypted tokens.
    const integrations = await getIntegrationsForUser(user.id, "notion");
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]! as Record<string, unknown>;

    // accountId is bot_id from the mock token response.
    expect(integration.provider_account_id).toBe("bot-mock-e2e-id");

    // Access token is encrypted (NOT the plaintext mock value).
    expect(integration.access_token_encrypted).toBeTruthy();
    expect(integration.access_token_encrypted).not.toBe(
      "secret_notion-mock-e2e-access",
    );

    // Refresh token is INTENTIONALLY DROPPED (Slice 9 scope decision —
    // even though Notion's response includes one).
    expect(integration.refresh_token_encrypted).toBeNull();

    // OAuth state row was atomically consumed across both connect flows
    // — total count back to baseline.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // Mock-call assertions: authorize + token exchange recorded.
    const callsAfterOAuth = await fetchNotionCalls(request, notionMock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.pagesCreate).toHaveLength(0);

    // Authorize URL has NO scope param (Notion-specific — capabilities
    // are integration-level).
    expect(callsAfterOAuth.calls.authorize[0]!.scope).toBeNull();
    // Authorize URL routed back to the standard dispatcher callback.
    expect(callsAfterOAuth.calls.authorize[0]!.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/notion\/callback$/,
    );
    // owner=user is sent on the authorize URL.
    expect(callsAfterOAuth.calls.authorize[0]!.owner).toBe("user");
    expect(callsAfterOAuth.calls.authorize[0]!.responseType).toBe("code");

    // Token exchange used HTTP Basic auth + application/json body.
    // The mock validates this format strictly — these assertions also
    // double-check the recorded headers.
    const tokenCall = callsAfterOAuth.calls.tokenExchange[0]!;
    expect(tokenCall.authorization).toMatch(/^Basic /);
    // The Basic credential is base64(client_id:client_secret).
    const expectedAuth = `Basic ${Buffer.from(
      `${process.env.NOTION_CLIENT_ID ?? "e2e-notion-client-id"}:${process.env.NOTION_CLIENT_SECRET ?? "e2e-notion-client-secret"}`,
    ).toString("base64")}`;
    expect(tokenCall.authorization).toBe(expectedAuth);
    expect(tokenCall.contentType).toContain("application/json");
    expect(tokenCall.parsedBody.grant_type).toBe("authorization_code");
    expect(typeof tokenCall.parsedBody.code).toBe("string");
    expect(tokenCall.parsedBody.redirect_uri).toMatch(
      /\/api\/integrations\/oauth\/notion\/callback$/,
    );

    // ── 4. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page.getByLabel(/workflow name/i).fill("E2E Notion Walkthrough");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 5. Configure trigger + action via API patch ──
    // Slack trigger (the entry point) + Notion create_page action.
    // The action's properties exercise 5 of the 9 supported types
    // (title, rich_text, select, checkbox, number) so the
    // formatProperties helper is exercised in production code.
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "slack",
          type: "message",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "notion",
          type: "create_page",
          config: {
            parent: { databaseId: "mock-db-id" },
            properties: {
              Name: { type: "title", value: "E2E new page" },
              Body: { type: "rich_text", value: "Created from Slack trigger" },
              Status: { type: "select", value: "Open" },
              Priority: { type: "number", value: 3 },
              Done: { type: "checkbox", value: false },
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

    // Reload so the server-rendered builder picks up the patched definition.
    await page.reload();
    const nodeList = page.locator('ol[aria-label="Workflow nodes"]');
    await expect(nodeList.getByText(/trigger/i).first()).toBeVisible();
    await expect(nodeList.getByText(/action/i).first()).toBeVisible();

    // ── 6. Activate workflow via UI ──
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // ── 7. POST signed Slack webhook event to V2 ──
    const webhookBody = buildSlackEventBody({ teamId: "T-MOCK-TEAM" });
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = signSlackWebhook(
      ts,
      webhookBody,
      requireEnv("SLACK_SIGNING_SECRET"),
    );
    const webhookResp = await request.post("/api/webhooks/slack", {
      headers: {
        "x-slack-request-timestamp": ts,
        "x-slack-signature": signature,
        "content-type": "application/json",
      },
      data: webhookBody,
    });
    expect(webhookResp.status(), await webhookResp.text()).toBe(200);

    // ── 8. Wait for execution → workflow_runs row → assert succeeded ──
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

    // ── 9. Mock Notion saw exactly one create_page POST ──
    const callsAfterRun = await fetchNotionCalls(request, notionMock.baseUrl);
    expect(callsAfterRun.calls.pagesCreate).toHaveLength(1);
    const createCall = callsAfterRun.calls.pagesCreate[0]!;

    // Authorization header carries the (decrypted) bot access token.
    expect(createCall.authorization).toBe(
      "Bearer secret_notion-mock-e2e-access",
    );
    // Notion-Version header pins to 2022-06-28 (Slice 9 pin).
    expect(createCall.notionVersion).toBe("2022-06-28");
    // Content-Type is application/json (V2's _request helper sets this
    // for any body-bearing method).
    expect(createCall.contentType).toContain("application/json");

    // Body shape: typed properties were coerced into Notion's
    // wire-format via formatProperties. The discriminated `parent`
    // input was mapped to Notion's `database_id` shape.
    expect(createCall.body.parent).toEqual({ database_id: "mock-db-id" });
    expect(createCall.body.properties).toEqual({
      Name: {
        title: [{ type: "text", text: { content: "E2E new page" } }],
      },
      Body: {
        rich_text: [
          { type: "text", text: { content: "Created from Slack trigger" } },
        ],
      },
      Status: { select: { name: "Open" } },
      Priority: { number: 3 },
      Done: { checkbox: false },
    });
    // No children / icon / cover were set — the wrapper omits them
    // (Q11 — undefined fields don't make it into the body).
    expect(createCall.body.children).toBeUndefined();
    expect(createCall.body.icon).toBeUndefined();
    expect(createCall.body.cover).toBeUndefined();

    // ── 10. UI: Run history shows the succeeded run ──
    await page.reload();
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i)).toBeVisible();

    // ── 11. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);
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

interface NotionMockInspect {
  calls: {
    authorize: {
      state: string;
      scope: string | null;
      redirectUri: string | null;
      responseType: string | null;
      owner: string | null;
    }[];
    tokenExchange: {
      authorization: string | undefined;
      contentType: string | undefined;
      body: string;
      parsedBody: Record<string, unknown>;
    }[];
    pagesCreate: {
      authorization: string | undefined;
      notionVersion: string | undefined;
      contentType: string | undefined;
      body: Record<string, unknown>;
      responsePageId: string;
    }[];
    pagesGet: {
      authorization: string | undefined;
      notionVersion: string | undefined;
      url: string;
      pageId: string;
    }[];
    pagesUpdate: {
      authorization: string | undefined;
      notionVersion: string | undefined;
      pageId: string;
      body: Record<string, unknown>;
    }[];
    databasesQuery: {
      authorization: string | undefined;
      notionVersion: string | undefined;
      databaseId: string;
      body: Record<string, unknown>;
    }[];
    blocksAppend: {
      authorization: string | undefined;
      notionVersion: string | undefined;
      blockId: string;
      body: Record<string, unknown>;
    }[];
    search: {
      authorization: string | undefined;
      notionVersion: string | undefined;
      body: Record<string, unknown>;
    }[];
  };
  pageIds: string[];
}

async function fetchNotionCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<NotionMockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as NotionMockInspect;
}

function buildSlackEventBody(opts: { teamId: string }): string {
  return JSON.stringify({
    type: "event_callback",
    team_id: opts.teamId,
    event_id: `Ev${Date.now()}`,
    event_time: Math.floor(Date.now() / 1000),
    event: {
      type: "message",
      channel: "C-MOCK-CHANNEL",
      user: "U-MOCK-SENDER",
      text: "test message",
      ts: `${Date.now() / 1000}`,
    },
  });
}

function signSlackWebhook(
  ts: string,
  rawBody: string,
  signingSecret: string,
): string {
  const base = `v0:${ts}:${rawBody}`;
  const hex = createHmac("sha256", signingSecret).update(base).digest("hex");
  return `v0=${hex}`;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`e2e: ${name} env var is required`);
  return v;
}
