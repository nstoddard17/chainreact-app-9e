import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  createTestUser,
  deleteHubSpotAppSubscriptionsForApp,
  deleteTestUser,
  getDedupRow,
  getHubSpotAppSubscriptions,
  getHubSpotSubscriptionRefs,
  getIntegrationsForUser,
  getNotificationsForUser,
  getOAuthStateRowCount,
  getTriggerResourcesForUser,
  getWorkflowRunsForUser,
  waitFor,
  type TestUser,
} from "./helpers/supabaseAdmin";
import { readHubSpotMockState } from "./global-setup";

/**
 * Slice 13 end-to-end walkthrough — HubSpot.
 *
 * V2's first CRM provider AND first app-level shared-subscription
 * webhook trigger with portal-scoped reference counting.
 * `X-HubSpot-Signature-V3` is HMAC-SHA256-base64 over
 * `${method}${requestUri}${rawBody}${timestampMs}` keyed with
 * `HUBSPOT_CLIENT_SECRET`, with a separate `X-HubSpot-Request-Timestamp`
 * header and 5-minute replay tolerance.
 *
 * Real surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in).
 *   - OAuth dispatcher / state / atomic consume against the standard
 *     `[provider]` route. HubSpot uses NO PKCE + body-auth (client_secret
 *     in form body, no Authorization header) — the mock validates both.
 *   - Token encryption (AES-256-GCM) + integration row writeback.
 *   - Dual-endpoint account-info resolution: primary
 *     `/oauth/v1/access-tokens/{token}` returns `hub_id` + `hub_domain`
 *     + `user`. `accountId` = stringified hub_id ("9988776").
 *   - Workflow create + activate (`webhook_received` trigger
 *     registration creating ONE HubSpot app-level subscription per
 *     selected `(eventType, propertyName)` tuple).
 *   - **Shared-subscription model.** Activating a SECOND workflow against
 *     the SAME `(eventType, propertyName)` adds a second row in
 *     `hubspot_subscription_refs` while leaving the
 *     `hubspot_app_subscriptions` count at 1 — and crucially the mock
 *     sees ZERO additional `POST /webhooks/v3/{appId}/subscriptions`
 *     calls. This is the load-bearing assertion for V2's
 *     shared-subscription design.
 *   - Trigger activation: `trigger_resources.config` stores `webhookEnabled:
 *     true`, `appId`, `hubId`, and `subscriptions[]` with
 *     `appSubscriptionId` + `hubspotSubscriptionId` for each entry.
 *     NO `type: "subscription-watch"` marker — HubSpot subscriptions
 *     don't expire and the runRenewals cron opts out via marker
 *     omission (same permanent-endpoint pattern as Stripe / Shopify).
 *   - Webhook receive: X-HubSpot-Signature-V3 verify (HMAC-SHA256-base64
 *     over `POST${uri}${rawBody}${timestampMs}` keyed with
 *     `HUBSPOT_CLIENT_SECRET`) → app-subscription lookup by `(appId,
 *     eventType, propertyName)` → portal-scoped ref lookup by
 *     `(app_subscription_id, hub_id=portalId)` → normalize → dispatch.
 *     NO `?workflowId=&nodeId=` query params — HubSpot Public Apps use
 *     ONE global URL configured in the developer-portal app settings;
 *     V2 routes by `portalId` field in payload.
 *   - Engine + create_contact action handler → POST
 *     `/crm/v3/objects/contacts` with `Authorization: Bearer
 *     <decrypted access token>`.
 *   - DB-backed dedup (webhook_event_dedup) catches duplicate eventId
 *     deliveries.
 *
 * Mocked surfaces (HubSpot network boundary only):
 *   - `{mock}/oauth/authorize` + `{mock}/oauth/v1/token`
 *   - `{mock}/oauth/v1/access-tokens/{token}` + `{mock}/integrations/v1/me`
 *   - `{mock}/crm/v3/objects/contacts`
 *   - `{mock}/webhooks/v3/{appId}/subscriptions{,/id}`
 *
 * Key HubSpot-specific assertions:
 *   - Authorize URL omits PKCE params (HubSpot rejects PKCE — V1
 *     generated a code_verifier but never sent code_challenge; V2
 *     drops the dead code).
 *   - Token exchange uses body-auth (client_secret in form body, NO
 *     Authorization header) and form-encoded body.
 *   - Refresh token IS persisted (encrypted) and access token expiry
 *     written.
 *   - `provider_account_id` is the stringified hub_id ("9988776").
 *   - `displayName` uses hub_domain when available ("mock-hub.example.test").
 *   - Webhook subscription POST omits `targetUrl` (V1 sends it; V2 omits —
 *     HubSpot Public Apps use a single global URL from the app settings).
 *   - Webhook subscription POST uses the MERCHANT access token (NOT a
 *     platform secret — distinct from Stripe Connect).
 *   - Trigger config does NOT carry `type: "subscription-watch"`.
 *   - Activating a SECOND workflow with the SAME subscription type adds
 *     a ref but does NOT call HubSpot again (refcount==2,
 *     webhookSubscriptionCreate==1).
 *   - Invalid signature → 401, no run, no action call.
 *   - Replay of same event (same eventId) → no duplicate run
 *     (webhook_event_dedup catches).
 *   - Unsupported subscription type (allowlisted globally but NOT
 *     mirrored in `hubspot_app_subscriptions`) → 200 ack, no run, no
 *     action call.
 */

const HUB_ID = "9988776";
const HUB_DOMAIN = "mock-hub.example.test";
const APP_ID = "11223344";

let testUser: TestUser | null = null;

test.describe("Slice 13 — full HubSpot walkthrough", () => {
  test.beforeEach(async () => {
    // `hubspot_app_subscriptions` is a system table — rows persist
    // across test runs because they aren't user-scoped. Without this
    // cleanup, run 2 sees the previous run's row and findOrCreate
    // short-circuits without calling HubSpot, breaking the mock-call
    // count assertion. ON DELETE CASCADE on
    // `hubspot_subscription_refs.app_subscription_id` cleans up
    // straggler refs.
    await deleteHubSpotAppSubscriptionsForApp(APP_ID);
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
    // Best-effort cleanup of system-table rows the user cascade can't
    // reach. Same pattern as beforeEach — keep the next run isolated.
    await deleteHubSpotAppSubscriptionsForApp(APP_ID);
  });

  test("sign in → connect HubSpot → activate (creates app subscription + ref) → activate 2nd workflow (shares subscription, refcount=2) → signed event → succeeded run → invalid-sig 401 → unknown-subscription ack → replay deduped", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readHubSpotMockState();

    // Per-run unique action email so two consecutive runs don't collide
    // on the mock's contact counter assertions.
    const runMarker = randomUUID();

    // Reset mock so per-test assertions are scoped to this run.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for the consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect HubSpot ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=hubspot/),
      page
        .getByRole("button", { name: "Connect HubSpot", exact: true })
        .click(),
    ]);

    // After OAuth: integrations page shows HubSpot connected.
    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // ── 4. DB assertions: integration row exists with encrypted tokens ──
    const integrations = await getIntegrationsForUser(user.id, "hubspot");
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]! as Record<string, unknown>;

    // accountId is the stringified hub_id from the primary
    // /oauth/v1/access-tokens/{token} resolution endpoint.
    expect(integration.provider_account_id).toBe(HUB_ID);

    // Access token + refresh token are both encrypted (NOT plaintext mock values).
    expect(integration.access_token_encrypted).toBeTruthy();
    expect(integration.access_token_encrypted).not.toBe(
      "hubspot-mock-e2e-access",
    );
    expect(integration.refresh_token_encrypted).toBeTruthy();
    expect(integration.refresh_token_encrypted).not.toBe(
      "hubspot-mock-e2e-refresh-1",
    );

    // Token expiry was captured from the 6h `expires_in: 21600`.
    expect(integration.access_token_expires_at).toBeTruthy();

    // Display name comes from hub_domain (the most user-recognizable
    // label per HubSpot's own UI conventions).
    expect(integration.display_name).toBe(HUB_DOMAIN);

    // Scopes echoed by mock — the 18 Slice 13 manifest scopes.
    const scopes = integration.scopes as readonly string[];
    expect(scopes).toEqual(
      expect.arrayContaining([
        "crm.objects.contacts.read",
        "crm.objects.contacts.write",
        "crm.objects.companies.read",
        "crm.objects.companies.write",
        "crm.objects.deals.read",
        "crm.objects.deals.write",
        "oauth",
      ]),
    );

    // OAuth state row was atomically consumed — count back to baseline.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // ── 5. Mock-call assertions: authorize + token + account-info ──
    const callsAfterOAuth = await fetchHubSpotCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    // Primary account-info endpoint resolved hub_id — fallback path
    // (/integrations/v1/me) must NOT have fired.
    expect(callsAfterOAuth.calls.accessTokenInfo).toHaveLength(1);
    expect(callsAfterOAuth.calls.integrationsMe).toHaveLength(0);

    const authorizeCall = callsAfterOAuth.calls.authorize[0]!;
    // HubSpot uses space-separated scopes (matches V1's join(" ")).
    expect(authorizeCall.scope).toContain("crm.objects.contacts.read");
    expect(authorizeCall.scope).toContain("oauth");
    expect(authorizeCall.responseType).toBeNull(); // V2 omits response_type — HubSpot defaults to code
    expect(authorizeCall.clientId).toBe("e2e-hubspot-client-id");
    expect(authorizeCall.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/hubspot\/callback$/,
    );
    // NO PKCE — HubSpot Public Apps don't accept these. Anti-test for
    // V2 accidentally regressing into PKCE mode.
    expect(authorizeCall.codeChallenge).toBeNull();
    expect(authorizeCall.codeChallengeMethod).toBeNull();

    // Token exchange used BODY-AUTH (client_secret in form body, NO
    // Authorization header). HubSpot's wire-format contract.
    const tokenCall = callsAfterOAuth.calls.tokenExchange[0]!;
    expect(tokenCall.authorization).toBeUndefined();
    expect(tokenCall.contentType).toContain(
      "application/x-www-form-urlencoded",
    );
    expect(tokenCall.parsedBody.grant_type).toBe("authorization_code");
    expect(tokenCall.parsedBody.client_id).toBe("e2e-hubspot-client-id");
    expect(tokenCall.parsedBody.client_secret).toBe(
      "e2e-hubspot-client-secret",
    );
    expect(tokenCall.parsedBody.code).toBeTruthy();
    // V1's oauthConfig.ts:397 sendRedirectUriWithRefresh: true — V2's
    // handleCallback sends redirect_uri on the authorization_code body too.
    expect(tokenCall.parsedBody.redirect_uri).toMatch(
      /\/api\/integrations\/oauth\/hubspot\/callback$/,
    );

    // Primary account-info call — no auth header, token in URL path.
    const accessTokenInfoCall = callsAfterOAuth.calls.accessTokenInfo[0]!;
    expect(accessTokenInfoCall.pathToken).toBe("hubspot-mock-e2e-access");
    expect(accessTokenInfoCall.authorization).toBeUndefined();

    // ── 6. Create FIRST workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill("E2E HubSpot Walkthrough — Primary");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 7. Configure trigger + action via API patch ──
    // Trigger: contact.creation (Batch 1 allowlist).
    // Action: create_contact — exercises /crm/v3/objects/contacts.
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "hubspot",
          type: "webhook_received",
          config: {
            subscriptions: [{ eventType: "contact.creation" }],
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "hubspot",
          type: "create_contact",
          config: {
            email: `action-${runMarker}@e2e.test`,
            firstname: "E2E",
            lastname: "Contact",
            duplicateHandling: "fail",
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

    // ── 8. Activate FIRST workflow via UI ──
    // Triggers HubSpot's activate hook:
    //   - findOrCreate hubspot_app_subscriptions row
    //   - POST /webhooks/v3/{appId}/subscriptions (first activation
    //     creates the HubSpot subscription)
    //   - upsert hubspot_subscription_refs row
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // ── 9. trigger_resources row stores HubSpot metadata ──
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    expect(triggerAfterActivate.provider).toBe("hubspot");
    expect(triggerAfterActivate.event_type).toBe("webhook_received");
    const configAfterActivate = triggerAfterActivate.config as {
      type?: string;
      webhookEnabled?: boolean;
      appId?: string;
      hubId?: string;
      subscriptions?: Array<{
        eventType: string;
        propertyName: string | null;
        appSubscriptionId: string;
        hubspotSubscriptionId: string;
      }>;
    };
    // Slice 13 design: NO `type: "subscription-watch"` — HubSpot
    // subscriptions don't expire and runRenewals filters on this marker
    // to skip HubSpot rows.
    expect(configAfterActivate.type).toBeUndefined();
    expect(configAfterActivate.webhookEnabled).toBe(true);
    expect(configAfterActivate.appId).toBe(APP_ID);
    expect(configAfterActivate.hubId).toBe(HUB_ID);
    expect(configAfterActivate.subscriptions).toHaveLength(1);
    const firstSub = configAfterActivate.subscriptions![0]!;
    expect(firstSub.eventType).toBe("contact.creation");
    expect(firstSub.propertyName).toBeNull();
    expect(firstSub.appSubscriptionId).toBeTruthy();
    expect(firstSub.hubspotSubscriptionId).toBeTruthy();

    // ── 10. hubspot_app_subscriptions + hubspot_subscription_refs ──
    const appSubsAfterFirstActivate = await getHubSpotAppSubscriptions(APP_ID);
    expect(appSubsAfterFirstActivate).toHaveLength(1);
    const appSub = appSubsAfterFirstActivate[0]! as Record<string, unknown>;
    expect(appSub.event_type).toBe("contact.creation");
    expect(appSub.property_name).toBeNull();
    expect(appSub.hubspot_subscription_id).toBe(firstSub.hubspotSubscriptionId);

    const refsAfterFirstActivate = await getHubSpotSubscriptionRefs(user.id);
    expect(refsAfterFirstActivate).toHaveLength(1);
    const firstRef = refsAfterFirstActivate[0]! as Record<string, unknown>;
    expect(firstRef.workflow_id).toBe(workflowId);
    expect(firstRef.node_id).toBe("trigger-node");
    expect(firstRef.hub_id).toBe(HUB_ID);
    expect(firstRef.app_subscription_id).toBe(firstSub.appSubscriptionId);

    // ── 11. Mock saw exactly 1 HubSpot subscription POST ──
    const callsAfterFirstActivate = await fetchHubSpotCalls(
      request,
      mock.baseUrl,
    );
    expect(callsAfterFirstActivate.calls.webhookSubscriptionCreate).toHaveLength(1);
    const subCreateCall =
      callsAfterFirstActivate.calls.webhookSubscriptionCreate[0]!;
    expect(subCreateCall.appId).toBe(APP_ID);
    expect(subCreateCall.eventType).toBe("contact.creation");
    expect(subCreateCall.propertyName).toBeNull();
    expect(subCreateCall.active).toBe(true);
    // V2's contract: NO targetUrl field. V1 sends it; V2 omits because
    // Public Apps use a single global URL from the app settings.
    expect(subCreateCall.targetUrl).toBeNull();
    // Webhook subscription POST uses the MERCHANT access token (NOT a
    // platform secret) — distinct from Stripe Connect's model.
    expect(subCreateCall.authorization).toBe(
      "Bearer hubspot-mock-e2e-access",
    );
    expect(subCreateCall.contentType).toContain("application/json");

    // ── 12. Create SECOND workflow with the SAME subscription type ──
    // Shared-subscription assertion: the second workflow MUST reuse the
    // existing app-level HubSpot subscription. This is the load-bearing
    // proof for the slice's portal-scoped reference counting design.
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill("E2E HubSpot Walkthrough — Sibling");
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const siblingWorkflowId = page
      .url()
      .match(/\/workflows\/([0-9a-f-]+)/)![1]!;
    expect(siblingWorkflowId).not.toBe(workflowId);

    // Sibling workflow's trigger subscribes to the same event type. The
    // action is also create_contact — different email so the assertion
    // can distinguish runs by payload.
    const siblingDraftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "hubspot",
          type: "webhook_received",
          config: {
            subscriptions: [{ eventType: "contact.creation" }],
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "hubspot",
          type: "create_contact",
          config: {
            email: `sibling-${runMarker}@e2e.test`,
            firstname: "Sibling",
            lastname: "Contact",
            duplicateHandling: "fail",
          },
          position: { x: 0, y: 100 },
        },
      ],
      edges: [{ id: "e1", from: "trigger-node", to: "action-node" }],
    };
    const siblingPatch = await page.request.patch(
      `/api/workflows/${siblingWorkflowId}`,
      { data: { draftDefinition: siblingDraftDefinition } },
    );
    expect(siblingPatch.status(), await siblingPatch.text()).toBe(200);

    await page.reload();
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(
      page.locator("[data-status-kind=active]"),
    ).toBeVisible({ timeout: 10_000 });

    // ── 13. Shared-subscription invariants ──
    // hubspot_app_subscriptions count STAYED at 1.
    const appSubsAfterSecondActivate = await getHubSpotAppSubscriptions(APP_ID);
    expect(appSubsAfterSecondActivate).toHaveLength(1);
    expect((appSubsAfterSecondActivate[0]! as { id: string }).id).toBe(
      (appSub as { id: string }).id,
    );

    // hubspot_subscription_refs count went from 1 to 2.
    const refsAfterSecondActivate = await getHubSpotSubscriptionRefs(user.id);
    expect(refsAfterSecondActivate).toHaveLength(2);
    const siblingRef = refsAfterSecondActivate.find(
      (r) => (r as Record<string, unknown>).workflow_id === siblingWorkflowId,
    ) as Record<string, unknown> | undefined;
    expect(siblingRef).toBeTruthy();
    expect(siblingRef!.app_subscription_id).toBe(firstSub.appSubscriptionId);
    expect(siblingRef!.hub_id).toBe(HUB_ID);

    // Mock saw EXACTLY 1 webhook subscription POST — the second
    // activate hit the shared-subscription fast path and did NOT call
    // HubSpot again.
    const callsAfterSecondActivate = await fetchHubSpotCalls(
      request,
      mock.baseUrl,
    );
    expect(
      callsAfterSecondActivate.calls.webhookSubscriptionCreate,
    ).toHaveLength(1);

    // ── 14. Invalid-signature ping → 401, no run, no action ──
    const invalidResp = await page.request.post(
      `${mock.baseUrl}/__sendInvalidSignaturePing`,
      { data: { portalId: Number(HUB_ID) } },
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
    const callsAfterInvalid = await fetchHubSpotCalls(request, mock.baseUrl);
    // No contact POST happened — signature gate runs first.
    expect(callsAfterInvalid.calls.contacts).toHaveLength(0);

    // ── 15. Unknown-subscription delivery → 200 ack, no run, no action ──
    // ticket.creation is allowlisted globally (in HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES)
    // but NO workflow's trigger subscribed to it → no row in
    // hubspot_app_subscriptions → receive route 200-acks with
    // skipReason: "unknown_subscription".
    const unknownResp = await page.request.post(
      `${mock.baseUrl}/__sendUnsupportedEvent`,
      {
        data: {
          subscriptionType: "ticket.creation",
          portalId: Number(HUB_ID),
        },
      },
    );
    expect(unknownResp.status()).toBe(200);
    const unknownBody = (await unknownResp.json()) as {
      status: number;
      body: string;
    };
    expect(unknownBody.status).toBe(200);

    await new Promise((r) => setTimeout(r, 500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(0);
    const callsAfterUnknown = await fetchHubSpotCalls(request, mock.baseUrl);
    expect(callsAfterUnknown.calls.contacts).toHaveLength(0);

    // ── 16. Send a signed allowlisted event (contact.creation) ──
    const eventId = `1${runMarker.replace(/-/g, "").slice(0, 10)}`;
    const sendResp = await page.request.post(
      `${mock.baseUrl}/__sendWebhookEvent`,
      {
        data: {
          subscriptionType: "contact.creation",
          eventId,
          portalId: Number(HUB_ID),
          objectId: 5001,
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

    // ── 17. workflow_runs: BOTH workflows fire ──
    // Shared-subscription model: the same event from HubSpot triggers
    // BOTH workflows that subscribed. Two refs → two enqueued runs.
    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length >= 2 ? rows : null;
      },
      { description: "2 workflow_runs to appear", timeoutMs: 15_000 },
    );
    expect(runs).toHaveLength(2);
    for (const r of runs) {
      const row = r as Record<string, unknown>;
      expect(row.status).toBe("succeeded");
      expect(row.error_classification).toBeNull();
    }

    // ── 18. Mock saw exactly 2 contact POSTs — one per workflow ──
    const callsAfterRun = await fetchHubSpotCalls(request, mock.baseUrl);
    const contactPosts = callsAfterRun.calls.contacts.filter(
      (c) => c.method === "POST",
    );
    expect(contactPosts).toHaveLength(2);
    for (const c of contactPosts) {
      // Authorization carries the (decrypted) merchant access token.
      expect(c.authorization).toBe("Bearer hubspot-mock-e2e-access");
      expect(c.contentType).toContain("application/json");
    }
    // Distinguish the two POSTs by email payload.
    const emails = contactPosts
      .map((c) => {
        const props = (c.parsedBody.properties ?? {}) as Record<string, unknown>;
        return props.email;
      })
      .sort();
    expect(emails).toEqual([
      `action-${runMarker}@e2e.test`,
      `sibling-${runMarker}@e2e.test`,
    ]);

    // ── 19. Dedup row written for eventId ──
    const dedupRow = await getDedupRow("hubspot", eventId);
    expect(dedupRow).not.toBeNull();

    // ── 20. UI: Run history shows the succeeded run on the primary workflow ──
    await page.goto(`/workflows/${workflowId}`);
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i).first()).toBeVisible();

    // ── 21. No notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ── 22. Replay: same signed body → dedup blocks ──
    // HubSpot retries failed deliveries with the SAME eventId.
    // webhook_event_dedup keyed on (provider, eventId) catches the
    // duplicate at dispatch time — neither workflow should fire again.
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
    expect(runsAfterReplay).toHaveLength(2);

    // Contact POST count stayed at 2 — load-bearing assertion that
    // dedup prevents replay across BOTH workflows.
    const callsAfterReplay = await fetchHubSpotCalls(request, mock.baseUrl);
    const contactPostsAfterReplay = callsAfterReplay.calls.contacts.filter(
      (c) => c.method === "POST",
    );
    expect(contactPostsAfterReplay).toHaveLength(2);
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

interface HubSpotMockInspect {
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
    accessTokenInfo: {
      pathToken: string;
      authorization: string | undefined;
    }[];
    integrationsMe: {
      authorization: string | undefined;
    }[];
    contacts: {
      method: string;
      authorization: string | undefined;
      contentType: string | undefined;
      url: string;
      body: string;
      parsedBody: Record<string, unknown>;
      responseContactId: string | null;
    }[];
    webhookSubscriptionCreate: {
      appId: string;
      authorization: string | undefined;
      contentType: string | undefined;
      body: string;
      parsedBody: Record<string, unknown>;
      eventType: string | null;
      propertyName: string | null;
      active: boolean | null;
      targetUrl: string | null;
      responseSubscriptionId: string;
    }[];
    webhookSubscriptionDelete: {
      appId: string;
      authorization: string | undefined;
      subscriptionId: string;
    }[];
    webhookEvent: {
      subscriptionType: string;
      eventId: string;
      portalId: string;
      url: string;
      status: number;
      responseBody: string;
    }[];
  };
  subscriptions: Array<{
    id: string;
    appId: string;
    eventType: string;
    propertyName: string | null;
    active: boolean;
  }>;
}

async function fetchHubSpotCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<HubSpotMockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as HubSpotMockInspect;
}
