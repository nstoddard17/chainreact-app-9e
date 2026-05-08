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
 * Slice 6 end-to-end walkthrough — Microsoft Outlook (mail).
 *
 * Mirrors the Slice 5b (Sheets) shape but for the Graph subscription flow.
 *
 * Real surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in)
 *   - OAuth dispatcher (`/api/integrations/oauth/microsoft-outlook/{connect,callback}`)
 *     — first non-Google non-Slack provider in V2; PKCE state row + atomic
 *     consume.
 *   - Token endpoint POST against Microsoft's /common/oauth2/v2.0/token
 *     (form-urlencoded + code_verifier).
 *   - Graph /me lookup at /v1.0/me?$select=mail,userPrincipalName,id
 *   - Service-role integration insert + token encryption (AES-256-GCM)
 *   - Workflow CRUD + active-lifecycle transition
 *   - Activation hook — registerWorkflowTriggers consults
 *     activationRegistry, calls Outlook's activate, which generates a
 *     32-byte hex clientState, calculates a 70.5h expirationDateTime, and
 *     POSTs /v1.0/subscriptions. The mock SYNCHRONOUSLY POSTs back to
 *     /api/webhooks/microsoft-outlook?validationToken=… and the route
 *     echoes the token as text/plain — that's the validation handshake.
 *     If it fails, the createSubscription call returns 4xx and the
 *     activate transition aborts with TRIGGER_REGISTRATION_FAILED.
 *   - trigger_resources row stores subscriptionId, clientState,
 *     expiresAt, resource, changeType, type=subscription-watch.
 *   - /api/webhooks/microsoft-outlook receives notifications: looks up
 *     trigger by JSONB containment on subscriptionId, verifies
 *     clientState, calls /me/messages/{id} via refreshAndRetry,
 *     normalizes → dispatch.
 *   - DB-backed dedup via webhook_event_dedup keyed
 *     (provider, eventId) where eventId is
 *     ${subscriptionId}:${messageId}:${changeType}.
 *   - Engine + canonical resolver + send_email handler (Q11 strict
 *     schema with required isHtml + importance).
 *   - refreshAndRetry token decryption on the principal /me/sendMail call.
 *
 * Mocked surfaces (Microsoft network boundary only):
 *   - login.microsoftonline.com /common/oauth2/v2.0/authorize → 302 to
 *     V2's microsoft-outlook callback with synthetic code (mock honors
 *     redirect_uri).
 *   - login.microsoftonline.com /common/oauth2/v2.0/token → canned access
 *     + refresh tokens; scope echo from the most recent authorize call.
 *   - graph.microsoft.com /v1.0/me → email + UPN + Azure id.
 *   - graph.microsoft.com /v1.0/me/sendMail → 202 No Content; records body.
 *   - graph.microsoft.com /v1.0/me/messages/{id} → returns the injected
 *     message resource.
 *   - graph.microsoft.com /v1.0/subscriptions → POSTs validation
 *     handshake to V2's webhook URL synchronously, then 201 with the
 *     subscription record.
 *
 * Dedup probe: send the same notification twice. webhook_event_dedup
 * blocks the second one at the dispatcher layer, so:
 *   - getMessage IS called twice (notification flow runs through to
 *     normalize before dedup).
 *   - sendMail count stays at 1 (load-bearing assertion).
 *   - workflow_runs count stays at 1.
 */

let testUser: TestUser | null = null;

test.describe("Slice 6 — full Microsoft Outlook walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Outlook → build + activate → notification → succeeded run → duplicate notification dedups", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMicrosoftMockState();

    // Per-run unique messageId so webhook_event_dedup never collides
    // across consecutive runs. The mock resets its subscription counter
    // on /__reset (so subscriptionId would otherwise be 'ms-sub-1' every
    // run, and dedup keys ${subscriptionId}:${messageId}:created would
    // collide). webhook_event_dedup is system-wide; deleteTestUser's FK
    // cascade doesn't reach it. Same caveat as Gmail / Calendar / Drive
    // / Sheets specs.
    const messageId = `AAMkAGI2-e2e-${randomUUID()}`;

    // Reset mock counters + Microsoft state.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect Microsoft Outlook (UI → mocked authorize → V2 callback → land) ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=microsoft-outlook/),
      page.getByRole("button", { name: "Connect Microsoft Outlook" }).click(),
    ]);

    // After OAuth: the integrations page shows a connected row.
    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // DB assertions: integration row exists with encrypted tokens.
    const integrations = await getIntegrationsForUser(
      user.id,
      "microsoft-outlook",
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
    // Scopes: granted set echoed by the mock — should include all three.
    const scopes = integration.scopes as readonly string[];
    expect(scopes).toEqual(
      expect.arrayContaining(["offline_access", "Mail.Send", "Mail.Read"]),
    );

    // OAuth state row was atomically consumed — total count back to baseline.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // Mock-call assertions: authorize + token exchange + /me lookup.
    const callsAfterOAuth = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.me).toHaveLength(1);
    expect(callsAfterOAuth.calls.subscriptionsCreate).toHaveLength(0);
    expect(callsAfterOAuth.calls.sendMail).toHaveLength(0);

    // Authorize redirect_uri was Outlook's callback (proves the dispatcher
    // built the right per-provider URL and the mock honored it).
    expect(callsAfterOAuth.calls.authorize[0]!.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/microsoft-outlook\/callback$/,
    );
    // Authorize scope: exactly the three Slice 6 scopes.
    expect(callsAfterOAuth.calls.authorize[0]!.scope).toBe(
      "offline_access Mail.Send Mail.Read",
    );
    // PKCE: code_challenge present + S256.
    expect(callsAfterOAuth.calls.authorize[0]!.codeChallenge).toBeTruthy();
    // response_mode=query (Microsoft v2 endpoint convention).
    expect(callsAfterOAuth.calls.authorize[0]!.responseMode).toBe("query");

    // Token exchange used PKCE: code_verifier was sent.
    expect(
      callsAfterOAuth.calls.tokenExchange[0]!.parsedBody.code_verifier,
    ).toBeTruthy();
    expect(callsAfterOAuth.calls.tokenExchange[0]!.parsedBody.grant_type).toBe(
      "authorization_code",
    );

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
    await page.getByLabel(/workflow name/i).fill("E2E Outlook Walkthrough");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 5. Configure trigger + action via API patch ──
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "microsoft-outlook",
          type: "new_email",
          // Slice 6 has no required trigger config fields beyond the
          // standard plumbing — the trigger emits one event per
          // notification with no per-trigger filtering.
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "microsoft-outlook",
          type: "send_email",
          // Hardcoded payload — variable resolution from the trigger
          // event is unit-tested elsewhere; this e2e exercises the
          // notification → dispatch → handler chain. Q11: isHtml +
          // importance are REQUIRED with no hidden defaults.
          config: {
            to: "alice@example.test",
            subject: "Echo from Outlook trigger",
            body: "Plain-text echo body",
            isHtml: false,
            importance: "normal",
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
    // Triggers Outlook's activate hook: generates clientState (32 random
    // bytes hex), calculates +4230-min expiration, POSTs /subscriptions.
    // The mock validates by POSTing back to V2's webhook URL with
    // ?validationToken=...; V2's route echoes as text/plain. If
    // validation fails, the POST returns 400 and activate aborts.
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // DB: trigger_resources row stores the subscription metadata.
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    expect(triggerAfterActivate.provider).toBe("microsoft-outlook");
    expect(triggerAfterActivate.event_type).toBe("new_email");
    const configAfterActivate = triggerAfterActivate.config as {
      type?: string;
      webhookEnabled?: boolean;
      resource?: string;
      changeType?: string;
      subscriptionId?: string;
      clientState?: string;
      expiresAt?: string;
    };
    expect(configAfterActivate.type).toBe("subscription-watch");
    expect(configAfterActivate.webhookEnabled).toBe(true);
    expect(configAfterActivate.resource).toBe("/me/messages");
    expect(configAfterActivate.changeType).toBe("created");
    expect(configAfterActivate.subscriptionId).toBeTruthy();
    // 32 random bytes → 64 hex chars.
    expect(configAfterActivate.clientState).toMatch(/^[0-9a-f]{64}$/);
    expect(configAfterActivate.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(configAfterActivate.expiresAt!).getTime()).toBeGreaterThan(
      Date.now(),
    );

    // Mock saw exactly one subscriptionsCreate call AND the validation
    // handshake completed (echoEcho matched).
    const callsAfterActivate = await fetchMockCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.subscriptionsCreate).toHaveLength(1);
    const createCall = callsAfterActivate.calls.subscriptionsCreate[0]!;
    expect(createCall.responseSubscriptionId).toBe(
      configAfterActivate.subscriptionId,
    );
    expect(createCall.validationStatus).toBe(200);
    expect(createCall.validationEchoMatched).toBe(true);
    // Subscription request body included our notificationUrl + lifecycle
    // URL + clientState + expirationDateTime.
    expect(createCall.body.notificationUrl).toBe(
      `${mock.appBaseUrl}/api/webhooks/microsoft-outlook`,
    );
    expect(createCall.body.lifecycleNotificationUrl).toBe(
      `${mock.appBaseUrl}/api/webhooks/microsoft-outlook/lifecycle`,
    );
    expect(createCall.body.clientState).toBe(configAfterActivate.clientState);
    expect(createCall.body.resource).toBe("/me/messages");
    expect(createCall.body.changeType).toBe("created");
    // The expirationDateTime in the request is the value we sent BEFORE
    // Graph normalized; the mock echoes it back unchanged in the
    // response, so config.expiresAt should match the request value.
    expect(createCall.body.expirationDateTime).toBe(
      configAfterActivate.expiresAt,
    );

    // ── 7. Inject a Graph message into the mock + send a notification ──
    const conversationId = "conv-e2e-1";
    const injectResp = await page.request.post(
      `${mock.baseUrl}/__injectMessage`,
      {
        data: {
          id: messageId,
          conversationId,
          subject: "Hello from Bob",
          bodyPreview: "Hi Alice, you've got mail.",
          body: {
            contentType: "text",
            content: "Hi Alice, you've got mail.\n\nBest,\nBob",
          },
          from: { emailAddress: { name: "Bob", address: "bob@e2e.test" } },
          toRecipients: [
            { emailAddress: { name: "Alice", address: "alice@e2e.test" } },
          ],
          ccRecipients: [],
          receivedDateTime: "2026-05-08T11:00:00Z",
          hasAttachments: false,
          importance: "normal",
          webLink: "https://outlook.office.com/owa/?ItemID=msg-1",
        },
      },
    );
    expect(injectResp.status()).toBe(200);

    // Mock POSTs the Graph notification envelope to V2's webhook URL.
    const notifyResp = await page.request.post(
      `${mock.baseUrl}/__sendNotification`,
      { data: { messageId } },
    );
    expect(notifyResp.status()).toBe(200);
    const notifyBody = (await notifyResp.json()) as {
      status: number;
      body: string;
    };
    // The route returns 200 even for empty event lists; a successful
    // dispatch returns 200 too.
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
    expect(callsAfterNotify.calls.getMessage).toHaveLength(1);
    expect(callsAfterNotify.calls.getMessage[0]!.messageId).toBe(messageId);
    expect(callsAfterNotify.calls.getMessage[0]!.authorization).toBe(
      "Bearer ms-mock-e2e-access",
    );
    // sendMail fired exactly once with the action's hardcoded payload.
    expect(callsAfterNotify.calls.sendMail).toHaveLength(1);
    const sendCall = callsAfterNotify.calls.sendMail[0]!;
    expect(sendCall.authorization).toBe("Bearer ms-mock-e2e-access");
    expect(sendCall.body.message).toEqual(
      expect.objectContaining({
        subject: "Echo from Outlook trigger",
        body: { contentType: "Text", content: "Plain-text echo body" },
        toRecipients: [
          { emailAddress: { address: "alice@example.test" } },
        ],
        importance: "normal",
      }),
    );
    expect(sendCall.body.saveToSentItems).toBe(true);

    // ── 10. Dedup row written ──
    // eventId = ${subscriptionId}:${messageId}:${changeType}
    const dedupEventId = `${configAfterActivate.subscriptionId}:${messageId}:created`;
    const dedupRow = await getDedupRow("microsoft-outlook", dedupEventId);
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
    // getMessage IS called again (the dedup gate is downstream of
    // normalize) but sendMail must NOT fire a second time and no second
    // workflow run should appear.
    const notifyResp2 = await page.request.post(
      `${mock.baseUrl}/__sendNotification`,
      { data: { messageId } },
    );
    expect(notifyResp2.status()).toBe(200);

    // Give the engine a moment to NOT execute a second run.
    await new Promise((r) => setTimeout(r, 1500));

    const runsAfterReplay = await getWorkflowRunsForUser(user.id);
    expect(runsAfterReplay).toHaveLength(1);

    const callsAfterReplay = await fetchMockCalls(request, mock.baseUrl);
    // getMessage fired again on the second notification (2 total).
    expect(callsAfterReplay.calls.getMessage).toHaveLength(2);
    // sendMail count stayed at 1 — the load-bearing assertion that the
    // action did NOT double-fire.
    expect(callsAfterReplay.calls.sendMail).toHaveLength(1);
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
}

async function fetchMockCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<MockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as MockInspect;
}
