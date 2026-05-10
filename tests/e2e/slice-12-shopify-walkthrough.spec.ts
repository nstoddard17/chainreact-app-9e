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
import { readShopifyMockState } from "./global-setup";

/**
 * Slice 12 end-to-end walkthrough — Shopify.
 *
 * V2's first per-shop multi-tenant OAuth provider AND first
 * single-app-secret webhook trigger (`X-Shopify-Hmac-SHA256` HMAC-SHA256
 * over raw body, base64).
 *
 * Real surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in).
 *   - OAuth dispatcher / state / atomic consume against the standard
 *     `[provider]` route. Shopify uses NO PKCE + JSON body-auth — the
 *     mock validates both. The shop subdomain enters the flow via
 *     `providerHint` on the connect POST body, gets bound into the
 *     signed JWT state, and is recovered in `handleCallback` from the
 *     JWT — NOT from any URL `?shop=` parameter (host-injection guard).
 *   - Token encryption (AES-256-GCM) + integration row writeback.
 *   - Per-shop URL routing — every Shopify call (OAuth authorize, OAuth
 *     token exchange, /shop.json, webhook lifecycle, /customers.json)
 *     embeds the merchant's shop domain in the URL path. The dev server
 *     has `SHOPIFY_API_BASE_OVERRIDE` set, so all `https://{shop}/...`
 *     calls land on the mock — and the mock asserts the shop domain
 *     made it onto every per-shop request.
 *   - Workflow create + activate (webhook_received trigger registration
 *     creating ONE webhook subscription per selected topic on the
 *     merchant shop, with the merchant's access token).
 *   - Trigger activation: trigger_resources row stores `shopDomain`,
 *     `topics`, `subscriptions`, `webhookEnabled: true`, `notificationUrl`.
 *     NO `type: "subscription-watch"` marker — Shopify webhook
 *     subscriptions don't expire and the runRenewals cron opts out via
 *     marker omission (same permanent-endpoint pattern as Stripe).
 *   - Webhook receive: X-Shopify-Hmac-SHA256 verify (HMAC-SHA256-base64
 *     over raw body keyed with global `SHOPIFY_CLIENT_SECRET`) →
 *     strict-direct trigger lookup via ?workflowId=X&nodeId=Y →
 *     activation-time topic allowlist filter → normalize → dispatch.
 *   - Engine + create_customer action handler → POST
 *     /admin/api/2024-10/customers.json with the decrypted merchant
 *     access token in `X-Shopify-Access-Token` (custom header, NOT
 *     `Authorization: Bearer`).
 *   - DB-backed dedup (webhook_event_dedup) catches duplicate
 *     X-Shopify-Webhook-Id header deliveries.
 *
 * Mocked surfaces (Shopify network boundary only):
 *   - {shop}/admin/oauth/{authorize,access_token}
 *   - {shop}/admin/api/2024-10/shop.json
 *   - {shop}/admin/api/2024-10/customers.json
 *   - {shop}/admin/api/2024-10/webhooks{,/id}.json
 *
 * Key Shopify-specific assertions:
 *   - Authorize URL omits PKCE (Shopify rejects code_challenge).
 *   - Token exchange uses Content-Type: application/json (NOT
 *     form-urlencoded — V2's first JSON-body OAuth) and carries
 *     client_secret + code in the JSON body (NO Basic auth header).
 *   - Token exchange URL embeds the shop domain (per-shop routing
 *     proof).
 *   - Token response carries NO refresh_token — V2 stores
 *     `refresh_token_encrypted = null`.
 *   - Action `X-Shopify-Access-Token` header on create_customer (NOT
 *     `Authorization: Bearer`).
 *   - Webhook lifecycle uses the merchant access token (NOT a platform
 *     secret) — distinct from Slice 11's Stripe Connect model.
 *   - Trigger config does NOT carry `type: "subscription-watch"`.
 *   - Invalid signature → 401, no run.
 *   - Replay of same event (same X-Shopify-Webhook-Id) → no duplicate
 *     run (webhook_event_dedup catches).
 *   - Unsupported topic (off the trigger's activation-time topic set)
 *     → 200 ack, no run, no action call.
 */

const SHOP_DOMAIN = "mock-shop.myshopify.com";

let testUser: TestUser | null = null;

test.describe("Slice 12 — full Shopify walkthrough", () => {
  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("sign in → connect Shopify (providerHint shop) → build + activate (creates 2 webhook subscriptions) → signed event → succeeded run with X-Shopify-Access-Token → invalid-sig 401 → unsupported-topic ack → replay deduped", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readShopifyMockState();

    // Per-run unique action email so two consecutive runs don't collide
    // on the mock's customer counter assertions.
    const runMarker = randomUUID();

    // Reset mock so per-test assertions are scoped to this run.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect Shopify ──
    // Shopify's connect flow REQUIRES `providerHint.shop` in the POST
    // body. The default integrations page's ConnectButton POSTs an
    // empty body (Slack default v2 contract) — for Shopify we drive
    // the connect endpoint directly from the spec to supply the hint.
    // V2's dispatcher validates the hint pre-state-creation, then
    // binds the normalized shop into the signed JWT state. The
    // returned authorize URL points at the mock; navigating drives
    // OAuth → callback → integration row.
    const connectResp = await page.request.post(
      "/api/integrations/oauth/shopify/connect",
      {
        data: { providerHint: { shop: SHOP_DOMAIN } },
      },
    );
    expect(connectResp.status(), await connectResp.text()).toBe(200);
    const { redirectUrl } = (await connectResp.json()) as {
      redirectUrl: string;
    };
    expect(redirectUrl).toContain(`/${SHOP_DOMAIN}/admin/oauth/authorize`);

    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=shopify/),
      page.goto(redirectUrl),
    ]);

    // After OAuth: integrations page shows Shopify connected.
    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // ── 4. DB assertions: integration row exists with encrypted tokens ──
    const integrations = await getIntegrationsForUser(user.id, "shopify");
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]! as Record<string, unknown>;

    // accountId is the normalized lowercase shop domain.
    expect(integration.provider_account_id).toBe(SHOP_DOMAIN);

    // Access token IS encrypted (NOT plaintext mock value); refresh
    // token is NULL (Shopify offline tokens have no refresh grant).
    expect(integration.access_token_encrypted).toBeTruthy();
    expect(integration.access_token_encrypted).not.toBe(
      "shopify-mock-e2e-access",
    );
    expect(integration.refresh_token_encrypted).toBeNull();

    // Scopes echoed by mock — exactly the 11 Slice 12 manifest scopes.
    const scopes = integration.scopes as readonly string[];
    expect(scopes).toEqual(
      expect.arrayContaining([
        "read_orders",
        "write_orders",
        "read_products",
        "write_products",
        "read_customers",
        "write_customers",
        "read_inventory",
        "write_inventory",
        "read_checkouts",
        "read_fulfillments",
        "write_fulfillments",
      ]),
    );

    // OAuth state row was atomically consumed — count back to baseline.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // ── 5. Mock-call assertions: authorize + token + shop.json ──
    const callsAfterOAuth = await fetchShopifyCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.shopJson).toHaveLength(1);

    const authorizeCall = callsAfterOAuth.calls.authorize[0]!;
    expect(authorizeCall.shop).toBe(SHOP_DOMAIN);
    // Shopify uses comma-separated scopes (the distinguishing feature
    // vs every other V2 OAuth provider's space-separation).
    expect(authorizeCall.scope).toBe(
      "read_orders,write_orders,read_products,write_products,read_customers,write_customers,read_inventory,write_inventory,read_checkouts,read_fulfillments,write_fulfillments",
    );
    expect(authorizeCall.clientId).toBe("e2e-shopify-client-id");
    expect(authorizeCall.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/shopify\/callback$/,
    );
    // NO PKCE — Shopify rejects these. Anti-test for V2 accidentally
    // regressing into PKCE mode.
    expect(authorizeCall.codeChallenge).toBeNull();
    expect(authorizeCall.codeChallengeMethod).toBeNull();

    // Token exchange used JSON body — NOT form-urlencoded. The
    // distinguishing wire-format feature for Shopify vs every other
    // refreshable V2 provider (Stripe / Google / Microsoft / Notion /
    // Airtable all use form-encoded).
    const tokenCall = callsAfterOAuth.calls.tokenExchange[0]!;
    expect(tokenCall.shop).toBe(SHOP_DOMAIN);
    // Authorization header MUST NOT be set — Shopify uses JSON body-auth.
    expect(tokenCall.authorization).toBeUndefined();
    expect(tokenCall.contentType).toContain("application/json");
    expect(tokenCall.parsedBody.client_id).toBe("e2e-shopify-client-id");
    expect(tokenCall.parsedBody.client_secret).toBe(
      "e2e-shopify-client-secret",
    );
    expect(typeof tokenCall.parsedBody.code).toBe("string");
    expect((tokenCall.parsedBody.code as string).length).toBeGreaterThan(0);

    // /shop.json call carried the merchant's access token in the
    // custom X-Shopify-Access-Token header (NOT Authorization: Bearer).
    const shopJsonCall = callsAfterOAuth.calls.shopJson[0]!;
    expect(shopJsonCall.shop).toBe(SHOP_DOMAIN);
    expect(shopJsonCall.accessToken).toBe("shopify-mock-e2e-access");
    expect(shopJsonCall.authorization).toBeUndefined();

    // ── 6. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill("E2E Shopify Walkthrough");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 7. Configure trigger + action via API patch ──
    // Trigger listens for two Shopify topics. Action creates a Shopify
    // customer (the simplest customer-impacting action — exercises
    // /customers.json with the merchant access token via per-shop URL
    // routing).
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "shopify",
          type: "webhook_received",
          config: {
            topics: ["orders/create", "orders/paid"],
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "shopify",
          type: "create_customer",
          config: {
            email: `action-${runMarker}@e2e.test`,
            // Q11 consent gate — required, no default.
            send_welcome_email: false,
            first_name: "E2E",
            last_name: "Customer",
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
    // Triggers Shopify's activate hook: POST /webhooks.json once per
    // selected topic, persists ids in trigger_resources.
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // ── 9. trigger_resources row stores Shopify metadata ──
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    expect(triggerAfterActivate.provider).toBe("shopify");
    expect(triggerAfterActivate.event_type).toBe("webhook_received");
    const configAfterActivate = triggerAfterActivate.config as {
      type?: string;
      webhookEnabled?: boolean;
      shopDomain?: string;
      topics?: string[];
      subscriptions?: { topic: string; webhookId: number }[];
      notificationUrl?: string;
    };
    // Slice 12 design: NO `type: "subscription-watch"` — Shopify
    // webhooks don't expire and runRenewals filters on this marker
    // to skip Shopify rows.
    expect(configAfterActivate.type).toBeUndefined();
    expect(configAfterActivate.webhookEnabled).toBe(true);
    expect(configAfterActivate.shopDomain).toBe(SHOP_DOMAIN);
    expect(configAfterActivate.topics).toEqual([
      "orders/create",
      "orders/paid",
    ]);
    expect(configAfterActivate.subscriptions).toHaveLength(2);
    expect(configAfterActivate.subscriptions![0]!.topic).toBe("orders/create");
    expect(configAfterActivate.subscriptions![1]!.topic).toBe("orders/paid");
    expect(configAfterActivate.subscriptions![0]!.webhookId).toBeGreaterThan(0);
    expect(configAfterActivate.subscriptions![1]!.webhookId).toBeGreaterThan(0);
    expect(configAfterActivate.notificationUrl).toMatch(
      /\/api\/webhooks\/shopify\?/,
    );
    expect(configAfterActivate.notificationUrl).toContain(
      `nodeId=trigger-node`,
    );

    // Mock saw exactly 2 webhook creations (one per topic) using the
    // MERCHANT access token (NOT a platform secret — Slice 12's
    // structurally-different model from Stripe Connect).
    const callsAfterActivate = await fetchShopifyCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.webhookCreate).toHaveLength(2);
    const orderedCreates = [...callsAfterActivate.calls.webhookCreate].sort(
      (a, b) =>
        (configAfterActivate.subscriptions!.findIndex(
          (s) => s.webhookId === a.responseWebhookId,
        ) ?? 0) -
        (configAfterActivate.subscriptions!.findIndex(
          (s) => s.webhookId === b.responseWebhookId,
        ) ?? 0),
    );
    expect(orderedCreates.map((c) => c.topic)).toEqual([
      "orders/create",
      "orders/paid",
    ]);
    for (const c of orderedCreates) {
      expect(c.shop).toBe(SHOP_DOMAIN);
      expect(c.accessToken).toBe("shopify-mock-e2e-access");
      expect(c.address).toMatch(/\/api\/webhooks\/shopify\?/);
      expect(c.address).toContain("nodeId=trigger-node");
    }

    // ── 10. Invalid-signature ping → 401, no run, no action ──
    const firstSubId = configAfterActivate.subscriptions![0]!.webhookId;
    const invalidResp = await page.request.post(
      `${mock.baseUrl}/__sendInvalidSignaturePing`,
      { data: { webhookId: firstSubId } },
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
    const callsAfterInvalid = await fetchShopifyCalls(request, mock.baseUrl);
    // No customer POST happened — signature gate runs first.
    expect(callsAfterInvalid.calls.customers).toHaveLength(0);

    // ── 11. Unsupported-topic delivery → 200 ack, no run, no action ──
    // Topic is allowlisted globally (customers/create) but the trigger
    // only subscribed to orders/* — defense-in-depth filter 200-acks
    // without dispatch.
    const unsupportedResp = await page.request.post(
      `${mock.baseUrl}/__sendUnsupportedTopic`,
      {
        data: {
          webhookId: firstSubId,
          topic: "customers/create",
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
    const callsAfterUnsupported = await fetchShopifyCalls(request, mock.baseUrl);
    expect(callsAfterUnsupported.calls.customers).toHaveLength(0);

    // ── 12. Send a signed allowlisted event (orders/create) ──
    const eventId = `webhook-id-${runMarker}`;
    const sendResp = await page.request.post(
      `${mock.baseUrl}/__sendWebhookEvent`,
      {
        data: {
          webhookId: firstSubId,
          topic: "orders/create",
          eventId,
          body: {
            id: 9999001,
            email: `buyer-${runMarker}@e2e.test`,
            total_price: "20.99",
            currency: "USD",
            financial_status: "paid",
            created_at: new Date().toISOString(),
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
    const callsAfterRun = await fetchShopifyCalls(request, mock.baseUrl);
    const customerPosts = callsAfterRun.calls.customers.filter(
      (c) => c.method === "POST",
    );
    expect(customerPosts).toHaveLength(1);
    const customerCall = customerPosts[0]!;
    // Per-shop URL routing: action used the integration's shop, never
    // overridden by action config (Slice 12's "action config CANNOT
    // override the shop" contract).
    expect(customerCall.shop).toBe(SHOP_DOMAIN);
    // Shopify uses X-Shopify-Access-Token (custom header), NOT
    // Authorization: Bearer.
    expect(customerCall.accessToken).toBe("shopify-mock-e2e-access");
    expect(customerCall.authorization).toBeUndefined();
    expect(customerCall.contentType).toContain("application/json");
    const customerParsed = customerCall.parsedBody.customer as Record<
      string,
      unknown
    >;
    expect(customerParsed.email).toBe(`action-${runMarker}@e2e.test`);
    expect(customerParsed.first_name).toBe("E2E");
    expect(customerParsed.last_name).toBe("Customer");
    // Q11 consent gate maps to send_email_welcome at the wire layer.
    expect(customerParsed.send_email_welcome).toBe(false);

    // ── 15. Dedup row written for X-Shopify-Webhook-Id ──
    const dedupRow = await getDedupRow("shopify", eventId);
    expect(dedupRow).not.toBeNull();

    // ── 16. UI: Run history shows the succeeded run ──
    await page.reload();
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i)).toBeVisible();

    // ── 17. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ── 18. Replay: same signed body → dedup blocks (event id matches) ──
    // Shopify retries failed deliveries with the SAME
    // X-Shopify-Webhook-Id header. webhook_event_dedup keyed on
    // (provider, eventId) catches the duplicate at dispatch time.
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
    const callsAfterReplay = await fetchShopifyCalls(request, mock.baseUrl);
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

interface ShopifyMockInspect {
  calls: {
    authorize: {
      shop: string;
      state: string;
      redirectUri: string | null;
      responseType: string | null;
      scope: string | null;
      clientId: string | null;
      codeChallenge: string | null;
      codeChallengeMethod: string | null;
    }[];
    tokenExchange: {
      shop: string;
      authorization: string | undefined;
      contentType: string | undefined;
      body: string;
      parsedBody: Record<string, unknown>;
    }[];
    shopJson: {
      shop: string;
      accessToken: string | undefined;
      authorization: string | undefined;
    }[];
    customers: {
      method: string;
      shop: string;
      accessToken: string | undefined;
      authorization: string | undefined;
      contentType: string | undefined;
      url: string;
      body: string;
      parsedBody: Record<string, unknown>;
      responseCustomerId: number | null;
    }[];
    webhookCreate: {
      shop: string;
      accessToken: string | undefined;
      body: string;
      parsedBody: Record<string, unknown>;
      topic: string | null;
      address: string | null;
      responseWebhookId: number;
    }[];
    webhookDelete: {
      shop: string;
      accessToken: string | undefined;
      webhookId: number;
    }[];
    webhookEvent: {
      webhookId: number;
      shop: string;
      topic: string;
      url: string;
      webhookHeaderId: string;
      status: number;
      responseBody: string;
    }[];
  };
  webhooks: Array<{
    id: number;
    shop: string;
    topic: string;
    address: string;
  }>;
}

async function fetchShopifyCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<ShopifyMockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as ShopifyMockInspect;
}
