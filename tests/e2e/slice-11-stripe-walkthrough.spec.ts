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
import { readStripeMockState } from "./global-setup";

/**
 * Slice 11 end-to-end walkthrough — Stripe.
 *
 * V2's first body-auth refreshable provider AND first
 * `Stripe-Signature: t=,v1=` HMAC-over-`${t}.${rawBody}` webhook.
 *
 * Real surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in).
 *   - OAuth dispatcher / state / atomic consume against the standard
 *     `[provider]` route. Stripe Connect uses NO PKCE + body-auth
 *     (client_secret in form body, no Authorization header) — the mock
 *     validates both.
 *   - Token encryption (AES-256-GCM) + integration row writeback.
 *   - stripe_user_id resolution from the token-exchange response
 *     (no follow-up account-info fetch).
 *   - Workflow create + activate (event_received trigger registration).
 *   - Trigger activation: webhook_endpoints POST → trigger_resources
 *     row stores `endpointId`, `endpointSecret`, `enabledEvents`,
 *     `webhookEnabled: true`. NO `type: "subscription-watch"` marker —
 *     Stripe webhook endpoints don't expire and the runRenewals cron
 *     opts out via marker omission.
 *   - Webhook receive: Stripe-Signature verify (HMAC-SHA256 over
 *     `${timestamp}.${rawBody}` with 300s tolerance) → strict-direct
 *     trigger lookup via ?workflowId=X&nodeId=Y → allowlist filter →
 *     normalize → dispatch.
 *   - Engine + create_customer action handler → POST /v1/customers
 *     with the decrypted bearer access token AND the
 *     `Idempotency-Key` HTTP header.
 *   - DB-backed dedup (webhook_event_dedup) catches duplicate
 *     event.id deliveries.
 *
 * Mocked surfaces (Stripe network boundary only):
 *   - connect.stripe.com/oauth/{authorize,token}
 *   - api.stripe.com/v1/customers
 *   - api.stripe.com/v1/webhook_endpoints{,/id}
 *
 * Refresh-token preservation behavior is NOT exercised in this e2e —
 * Stripe's stable-refresh-token contract is covered by 4 dedicated
 * unit tests in `tests/unit/integrations/stripe/oauth.test.ts`.
 *
 * Key Stripe-specific assertions:
 *   - Authorize URL includes scope=read_write and NO PKCE params.
 *   - Token exchange uses body-auth (client_secret in form body, NO
 *     Authorization header).
 *   - Refresh token IS persisted (distinct from Notion which drops it).
 *   - Action `Idempotency-Key` header on create_customer (V2's first
 *     live consumer of the buildIdempotencyKey wire-format).
 *   - Trigger config does NOT carry `type: "subscription-watch"`.
 *   - Invalid signature → 401, no run, no action call.
 *   - Replay of same event (same event.id) → no duplicate run
 *     (webhook_event_dedup catches).
 *   - Unsupported event type (off-allowlist) → 200 ack, no run, no
 *     action call.
 */

let testUser: TestUser | null = null;

test.describe("Slice 11 — full Stripe walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Stripe → build + activate (creates webhook endpoint) → signed event → succeeded run with Idempotency-Key → invalid-sig 401 → unsupported-event ack → replay deduped", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readStripeMockState();

    // Per-run unique action email so two consecutive runs don't
    // collide on the mock's customer counter assertions.
    const runMarker = randomUUID();

    // Reset mock so per-test assertions are scoped to this run.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect Stripe ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=stripe/),
      page
        .getByRole("button", { name: "Connect Stripe", exact: true })
        .click(),
    ]);

    // After OAuth: integrations page shows Stripe connected.
    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // ── 4. DB assertions: integration row exists with encrypted tokens ──
    const integrations = await getIntegrationsForUser(user.id, "stripe");
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]! as Record<string, unknown>;

    // accountId is the merchant's Stripe Connect account id.
    expect(integration.provider_account_id).toBe("acct_TEST_E2E");

    // Access token + refresh token are both encrypted (NOT plaintext mock values).
    expect(integration.access_token_encrypted).toBeTruthy();
    expect(integration.access_token_encrypted).not.toBe(
      "stripe-mock-e2e-access",
    );
    expect(integration.refresh_token_encrypted).toBeTruthy();
    expect(integration.refresh_token_encrypted).not.toBe(
      "stripe-mock-e2e-refresh-1",
    );

    // Scope echoed by mock — Stripe Connect's binary scope model.
    const scopes = integration.scopes as readonly string[];
    expect(scopes).toEqual(["read_write"]);

    // OAuth state row was atomically consumed — total count back to baseline.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // ── 5. Mock-call assertions: authorize + token (NO whoami — Stripe doesn't need it) ──
    const callsAfterOAuth = await fetchStripeCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);

    const authorizeCall = callsAfterOAuth.calls.authorize[0]!;
    // Stripe Connect's binary scope = read_write (Slice 11 Batch 1).
    expect(authorizeCall.scope).toBe("read_write");
    expect(authorizeCall.responseType).toBe("code");
    expect(authorizeCall.clientId).toBe("ca_e2e_stripe_client_id");
    expect(authorizeCall.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/stripe\/callback$/,
    );
    // NO PKCE — Stripe Connect doesn't accept these. Anti-test for
    // V2 accidentally regressing into PKCE mode.
    expect(authorizeCall.codeChallenge).toBeNull();
    expect(authorizeCall.codeChallengeMethod).toBeNull();

    // Token exchange used BODY-AUTH (client_secret in form body, NO
    // Authorization header). The load-bearing wire-format
    // distinguisher vs every other refreshable V2 provider.
    const tokenCall = callsAfterOAuth.calls.tokenExchange[0]!;
    // Authorization header MUST NOT be set — Stripe Connect uses body-auth.
    expect(tokenCall.authorization).toBeUndefined();
    expect(tokenCall.contentType).toContain(
      "application/x-www-form-urlencoded",
    );
    expect(tokenCall.parsedBody.grant_type).toBe("authorization_code");
    expect(tokenCall.parsedBody.client_secret).toBe(
      "sk_e2e_stripe_client_secret",
    );
    expect(tokenCall.parsedBody.code).toBeTruthy();
    // Stripe's refresh body doesn't include redirect_uri (V2 omits;
    // Stripe Connect's token endpoint doesn't require it).
    expect(tokenCall.parsedBody.redirect_uri).toBeUndefined();

    // ── 6. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill("E2E Stripe Walkthrough");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 7. Configure trigger + action via API patch ──
    // Trigger listens for payment_intent.succeeded events.
    // Action creates a Stripe customer (the simplest billing-impacting
    // create-action — exercises the Idempotency-Key header path).
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "stripe",
          type: "event_received",
          config: {
            enabledEvents: ["payment_intent.succeeded"],
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "stripe",
          type: "create_customer",
          config: {
            email: `action-${runMarker}@e2e.test`,
            name: "E2E Test Customer",
            description: "Created by Slice 11 e2e walkthrough",
            metadata: { source: "chainreact-e2e", runMarker },
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
    // Triggers Stripe's activate hook: POST /v1/webhook_endpoints
    // with connect=true + enabled_events + notification URL.
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // ── 9. trigger_resources row stores endpoint metadata ──
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    expect(triggerAfterActivate.provider).toBe("stripe");
    expect(triggerAfterActivate.event_type).toBe("event_received");
    const configAfterActivate = triggerAfterActivate.config as {
      type?: string;
      webhookEnabled?: boolean;
      endpointId?: string;
      endpointSecret?: string;
      enabledEvents?: string[];
      notificationUrl?: string;
    };
    // Slice 11 design: NO `type: "subscription-watch"` — Stripe
    // endpoints don't expire and runRenewals filters on this marker
    // to skip Stripe rows.
    expect(configAfterActivate.type).toBeUndefined();
    expect(configAfterActivate.webhookEnabled).toBe(true);
    expect(configAfterActivate.endpointId).toBeTruthy();
    expect(configAfterActivate.endpointSecret).toMatch(/^whsec_/);
    expect(configAfterActivate.enabledEvents).toEqual([
      "payment_intent.succeeded",
    ]);
    expect(configAfterActivate.notificationUrl).toMatch(
      /\/api\/webhooks\/stripe\?/,
    );
    expect(configAfterActivate.notificationUrl).toContain(
      `nodeId=trigger-node`,
    );

    // Mock saw exactly 1 webhook_endpoints POST with connect=true +
    // enabled_events.
    const callsAfterActivate = await fetchStripeCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.webhookEndpointCreate).toHaveLength(1);
    const webhookCreateCall =
      callsAfterActivate.calls.webhookEndpointCreate[0]!;
    expect(webhookCreateCall.responseEndpointId).toBe(
      configAfterActivate.endpointId,
    );
    // connect=true is the Stripe Connect marker — events from
    // connected merchant accounts route to this endpoint.
    expect(webhookCreateCall.parsedBody.connect).toBe("true");
    // enabled_events array uses bracket notation per Stripe's
    // form-encoding (flattenForStripe handles this).
    expect(webhookCreateCall.parsedBody["enabled_events[0]"]).toBe(
      "payment_intent.succeeded",
    );
    // URL carries diagnostic workflowId + nodeId for the strict-direct
    // receive lookup.
    expect(webhookCreateCall.parsedBody.url).toMatch(
      /\/api\/webhooks\/stripe\?/,
    );
    expect(webhookCreateCall.parsedBody.url).toContain("nodeId=trigger-node");
    expect(webhookCreateCall.parsedBody.api_version).toBe(
      "2025-05-28.basil",
    );
    // Webhook endpoint creation uses the PLATFORM secret as bearer
    // (NOT the merchant access token). Slice 11's platform-vs-merchant
    // boundary.
    expect(webhookCreateCall.authorization).toBe(
      "Bearer sk_e2e_stripe_client_secret",
    );

    // ── 10. Invalid-signature ping → 401, no run, no action ──
    const invalidResp = await page.request.post(
      `${mock.baseUrl}/__sendInvalidSignaturePing`,
      { data: { endpointId: configAfterActivate.endpointId } },
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
    const callsAfterInvalid = await fetchStripeCalls(request, mock.baseUrl);
    // No customer POST happened — signature gate runs first.
    expect(callsAfterInvalid.calls.customers).toHaveLength(0);

    // ── 11. Unsupported-event delivery → 200 ack, no run, no action ──
    // Stripe could deliver an event outside our allowlist if the
    // endpoint subscription was reconfigured out of band. The receive
    // route's defense-in-depth allowlist filter 200-acks without
    // dispatch.
    const unsupportedResp = await page.request.post(
      `${mock.baseUrl}/__sendUnsupportedEvent`,
      {
        data: {
          endpointId: configAfterActivate.endpointId,
          eventType: "invoice.created", // valid Stripe event type, NOT in Slice 11 allowlist
        },
      },
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
    const callsAfterUnsupported = await fetchStripeCalls(request, mock.baseUrl);
    expect(callsAfterUnsupported.calls.customers).toHaveLength(0);

    // ── 12. Send a signed allowlisted event ──
    const eventId = `evt_e2e_${runMarker}`;
    const sendResp = await page.request.post(
      `${mock.baseUrl}/__sendWebhookEvent`,
      {
        data: {
          endpointId: configAfterActivate.endpointId,
          eventType: "payment_intent.succeeded",
          eventId,
          data: {
            id: "pi_e2e_test",
            amount: 2099,
            currency: "usd",
            status: "succeeded",
          },
        },
      },
    );
    expect(sendResp.status()).toBe(200);
    const sendBody = (await sendResp.json()) as {
      status: number;
      body: string;
      eventId: string;
    };
    expect(sendBody.status).toBe(200);
    expect(sendBody.eventId).toBe(eventId);

    // ── 13. workflow_run succeeds ──
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

    // ── 14. Mock saw exactly 1 customer POST (the action) ──
    const callsAfterRun = await fetchStripeCalls(request, mock.baseUrl);
    const customerPosts = callsAfterRun.calls.customers.filter(
      (c) => c.method === "POST",
    );
    expect(customerPosts).toHaveLength(1);
    const customerCall = customerPosts[0]!;
    // Authorization carries the (decrypted) merchant access token.
    expect(customerCall.authorization).toBe(
      "Bearer stripe-mock-e2e-access",
    );
    // Stripe-Version header pinned by V2's manifest.
    expect(customerCall.stripeVersion).toBe("2025-05-28.basil");
    // Form-encoded body shape.
    expect(customerCall.contentType).toContain(
      "application/x-www-form-urlencoded",
    );
    expect(customerCall.parsedBody.email).toBe(
      `action-${runMarker}@e2e.test`,
    );
    expect(customerCall.parsedBody.name).toBe("E2E Test Customer");
    expect(customerCall.parsedBody.description).toBe(
      "Created by Slice 11 e2e walkthrough",
    );
    expect(customerCall.parsedBody["metadata[source]"]).toBe(
      "chainreact-e2e",
    );
    expect(customerCall.parsedBody["metadata[runMarker]"]).toBe(runMarker);

    // ── 15. Idempotency-Key header — V2's first live consumer ──
    // Format: `${runId}:${nodeId}:${actionType}` per Slice 11 plan §17.
    expect(customerCall.idempotencyKey).toBeTruthy();
    expect(customerCall.idempotencyKey).toMatch(
      /:action-node:stripe_action_create_customer$/,
    );

    // ── 16. Dedup row written for event.id ──
    const dedupRow = await getDedupRow("stripe", eventId);
    expect(dedupRow).not.toBeNull();

    // ── 17. UI: Run history shows the succeeded run ──
    await page.reload();
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i)).toBeVisible();

    // ── 18. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ── 19. Replay: same signed body → dedup blocks (event.id matches) ──
    // Stripe retries failed deliveries for up to 3 days using the
    // SAME event.id. webhook_event_dedup keyed on (provider, event.id)
    // catches the duplicate at dispatch time.
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
    expect(runsAfterReplay).toHaveLength(1);

    // Customer POST count stayed at 1 — load-bearing assertion that
    // dedup prevents replay.
    const callsAfterReplay = await fetchStripeCalls(request, mock.baseUrl);
    const customerPostsAfterReplay = callsAfterReplay.calls.customers.filter(
      (c) => c.method === "POST",
    );
    expect(customerPostsAfterReplay).toHaveLength(1);
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

interface StripeMockInspect {
  calls: {
    authorize: {
      state: string;
      redirectUri: string | null;
      responseType: string | null;
      scope: string | null;
      clientId: string | null;
      codeChallenge: string | null;
      codeChallengeMethod: string | null;
    }[];
    tokenExchange: {
      authorization: string | undefined;
      contentType: string | undefined;
      body: string;
      parsedBody: Record<string, string>;
    }[];
    customers: {
      method: string;
      authorization: string | undefined;
      idempotencyKey: string | undefined;
      stripeVersion: string | undefined;
      contentType: string | undefined;
      url: string;
      body: string;
      parsedBody: Record<string, string>;
      responseCustomerId: string | null;
    }[];
    webhookEndpointCreate: {
      authorization: string | undefined;
      body: string;
      parsedBody: Record<string, string>;
      responseEndpointId: string;
    }[];
    webhookEndpointDelete: {
      authorization: string | undefined;
      endpointId: string;
    }[];
    webhookEvent: {
      endpointId: string;
      url: string;
      eventId: string;
      eventType: string;
      status: number;
      responseBody: string;
    }[];
  };
  endpoints: Array<{
    id: string;
    secret: string;
    url: string;
    enabled_events: string[];
  }>;
}

async function fetchStripeCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<StripeMockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as StripeMockInspect;
}
