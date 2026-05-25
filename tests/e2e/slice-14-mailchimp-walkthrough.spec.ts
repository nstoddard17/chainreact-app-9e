import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import {
  createTestUser,
  deleteTestUser,
  getDedupRow,
  getIntegrationsForUser,
  getNotificationsForUser,
  getOAuthStateRowCount,
  getTriggerResourcesForUser,
  getWorkflowRunsForUser,
  rewindTriggerPollingTimestamp,
  waitFor,
  type TestUser,
} from "./helpers/supabaseAdmin";
import { readMailchimpMockState } from "./global-setup";

/**
 * Slice 14 end-to-end walkthrough — Mailchimp.
 *
 * V2's first email-marketing provider AND first per-datacenter
 * API-host routing model. Mailchimp does NOT sign webhooks —
 * authentication relies on URL secrecy (workflowId/nodeId query
 * params), audienceId match against the trigger's stored audience,
 * event-type allowlist intersection, and DB-backed sha256(rawBody)
 * dedup.
 *
 * Real surfaces exercised:
 *   - Auth (Supabase admin createUser → UI sign-in).
 *   - OAuth dispatcher + state + atomic consume.
 *   - Body-auth OAuth with NO scope= URL parameter and NO PKCE.
 *   - `/oauth2/metadata` (Authorization: OAuth <token>) → dc capture.
 *   - `/3.0/` root (Authorization: Bearer <token>) → accountId capture.
 *   - Token encryption (AES-256-GCM); refresh token stays null.
 *   - Manifest-declared synthetic ["account_access"] scope persisted.
 *   - Workflow create + activate via UI.
 *   - audience_event trigger activation creates ONE webhook with
 *     full 6-event bitmap. webhookId + audienceId + eventTypes
 *     stored on trigger_resources.config; NO type:"subscription-watch".
 *   - Webhook receive route: form-encoded body parsing, audienceId
 *     match, event-type allowlist, dispatch via canonical
 *     TriggerEvent + DB-backed sha256(rawBody) dedup.
 *   - add_subscriber action handler: dc-routed
 *     `https://${dc}.api.mailchimp.com/3.0/lists/.../members/{hash}`
 *     PUT with decrypted Bearer token.
 *   - Polling trigger (email_opened) activation captures
 *     reportSummary baseline; second poll fires on totalOpens delta.
 *
 * Mocked surfaces (Mailchimp network boundary only):
 *   - {mock}/oauth2/authorize + {mock}/oauth2/token + {mock}/oauth2/metadata
 *   - {mock}/3.0/{,/lists,/lists/.../members,/lists/.../webhooks,
 *     /campaigns,/campaigns/{id},/reports/{id}}
 *
 * Key Mailchimp-specific assertions:
 *   - Authorize URL omits `scope=` (Mailchimp doesn't enforce scopes).
 *   - Token exchange is body-auth + form-encoded + NO Authorization
 *     header.
 *   - Refresh token persisted as NULL.
 *   - displayName uses accountName (most user-recognizable).
 *   - dc captured from /oauth2/metadata into accountMetadata.dc.
 *   - Webhook create includes events bitmap with selected = true and
 *     non-selected = false.
 *   - Webhook callback URL contains workflowId + nodeId query params.
 *   - Trigger config does NOT carry `type: "subscription-watch"`.
 *   - Dedup row keyed on sha256(rawBody).
 *   - Replay of same body → blocked by dedup.
 *   - Audience-mismatch event → 200 ack with skipped:true.
 *   - Unsupported event-type → 200 ack with skipped:true.
 *   - Polling baseline-first: snapshot captured at activate; first
 *     poll after activate (no delta) fires zero events.
 */

const ACCOUNT_ID = "8d3a3db4d97663a9074efcc16";
const ACCOUNT_NAME = "Acme Corp E2E";
const ACCOUNT_EMAIL = "owner@acme-e2e.test";
const DC = "us21";
const AUDIENCE_ID = "1a2b3c4d5e";

let testUser: TestUser | null = null;

test.describe("Slice 14 — full Mailchimp walkthrough", () => {
  // The Mailchimp walkthrough exercises a lot in one spec: OAuth →
  // workflow create + activate (webhook trigger) → webhook delivery
  // + dedup + audience mismatch + unsupported event → workflow
  // create + activate (polling trigger) → 3 poll cycles. Each
  // workflow create + activate involves UI navigation + render, so
  // 30s is too tight. Bump to 120s.
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

  test("sign in → connect Mailchimp → audience_event webhook + add_subscriber action + sha256 dedup + audience/event mismatch + polling baseline", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMailchimpMockState();
    const cronSecret = requireEnv("CRON_SECRET");

    const runMarker = randomUUID().replace(/-/g, "").slice(0, 12);

    // Reset mock so per-test assertions are scoped to this run.
    await page.request.post(`${mock.baseUrl}/__reset`);

    // ── 1. Sign in via UI ──
    await signIn(page, user);

    // ── 2. Snapshot oauth_states count for consumed-state assertion ──
    const oauthStatesBefore = await getOAuthStateRowCount();

    // ── 3. Connect Mailchimp ──
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=mailchimp/),
      page
        .getByRole("button", { name: "Connect Mailchimp", exact: true })
        .click(),
    ]);

    await page.goto("/integrations");
    await expect(
      page.locator('ul[aria-label="Integrations"]').getByText(/Connected/),
    ).toBeVisible();

    // ── 4. DB: integration row with dc + encrypted token + no refresh ──
    const integrations = await getIntegrationsForUser(user.id, "mailchimp");
    expect(integrations).toHaveLength(1);
    const integration = integrations[0]! as Record<string, unknown>;

    expect(integration.provider_account_id).toBe(ACCOUNT_ID);
    expect(integration.display_name).toBe(ACCOUNT_NAME);

    // Access token encrypted (NOT plaintext mock value).
    expect(integration.access_token_encrypted).toBeTruthy();
    expect(integration.access_token_encrypted).not.toBe(
      "mailchimp-mock-e2e-access",
    );
    // Refresh token MUST be null — Mailchimp is non-refreshable.
    expect(integration.refresh_token_encrypted).toBeNull();
    // No expiry — Mailchimp's `expires_in: 0` is a sentinel; V2 normalizes to null.
    expect(integration.access_token_expires_at).toBeNull();

    // Synthetic ["account_access"] scope persisted (matches manifest).
    expect(integration.scopes).toEqual(["account_access"]);

    // dc captured into accountMetadata at OAuth callback time.
    const metadata = integration.account_metadata as Record<string, unknown>;
    expect(metadata.dc).toBe(DC);
    expect(metadata.mailchimpAccountId).toBe(ACCOUNT_ID);
    expect(metadata.email).toBe(ACCOUNT_EMAIL);
    expect(metadata.scopesGranted).toEqual(["account_access"]);

    // OAuth state row atomically consumed.
    const oauthStatesAfter = await getOAuthStateRowCount();
    expect(oauthStatesAfter).toBe(oauthStatesBefore);

    // ── 5. Mock: authorize + body-auth token + OAuth-prefix metadata + Bearer /3.0/ ──
    const callsAfterOAuth = await fetchMailchimpCalls(request, mock.baseUrl);
    expect(callsAfterOAuth.calls.authorize).toHaveLength(1);
    expect(callsAfterOAuth.calls.tokenExchange).toHaveLength(1);
    expect(callsAfterOAuth.calls.metadata).toHaveLength(1);
    expect(callsAfterOAuth.calls.apiRoot).toHaveLength(1);

    const authorizeCall = callsAfterOAuth.calls.authorize[0]!;
    expect(authorizeCall.responseType).toBe("code");
    expect(authorizeCall.clientId).toBe("e2e-mailchimp-client-id");
    expect(authorizeCall.redirectUri).toMatch(
      /\/api\/integrations\/oauth\/mailchimp\/callback$/,
    );
    // Mailchimp doesn't enforce scopes; V2's buildAuthUrl omits `scope=`.
    expect(authorizeCall.scope).toBeNull();
    // No PKCE.
    expect(authorizeCall.codeChallenge).toBeNull();
    expect(authorizeCall.codeChallengeMethod).toBeNull();

    const tokenCall = callsAfterOAuth.calls.tokenExchange[0]!;
    // Body-auth: no Authorization header; client_secret in body.
    expect(tokenCall.authorization).toBeUndefined();
    expect(tokenCall.contentType).toContain("application/x-www-form-urlencoded");
    expect(tokenCall.parsedBody.grant_type).toBe("authorization_code");
    expect(tokenCall.parsedBody.client_id).toBe("e2e-mailchimp-client-id");
    expect(tokenCall.parsedBody.client_secret).toBe(
      "e2e-mailchimp-client-secret",
    );
    expect(tokenCall.parsedBody.redirect_uri).toMatch(
      /\/api\/integrations\/oauth\/mailchimp\/callback$/,
    );

    // Metadata fetch uses Mailchimp's legacy `OAuth <token>` header.
    const metadataCall = callsAfterOAuth.calls.metadata[0]!;
    expect(metadataCall.authorization).toBe(
      "OAuth mailchimp-mock-e2e-access",
    );
    // /3.0/ root uses Bearer.
    const apiRootCall = callsAfterOAuth.calls.apiRoot[0]!;
    expect(apiRootCall.authorization).toBe(
      "Bearer mailchimp-mock-e2e-access",
    );

    // ── 6. Create workflow via UI ──
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill(`E2E Mailchimp Walkthrough — ${runMarker}`);
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    // ── 7. Configure trigger + action via API patch ──
    // Trigger: audience_event with subscribe + unsubscribe selected
    //          (other 4 deliberately omitted to exercise allowlist).
    // Action: add_subscriber — exercises dc-routed
    //          /3.0/lists/{audienceId}/members/{hash}.
    const subscriberEmail = `subscriber-${runMarker}@e2e.test`;
    const draftDefinition = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "mailchimp",
          type: "audience_event",
          config: {
            audienceId: AUDIENCE_ID,
            eventTypes: ["subscribe", "unsubscribe"],
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "action-node",
          kind: "action" as const,
          provider: "mailchimp",
          type: "add_subscriber",
          config: {
            audience_id: AUDIENCE_ID,
            email: subscriberEmail,
            status: "pending",
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

    // ── 8. Activate via UI ──
    // Mailchimp's audience_event activation hook:
    //   - Reads node.config { audienceId, eventTypes }.
    //   - Reads dc from integration.accountMetadata.
    //   - POSTs /3.0/lists/{audienceId}/webhooks with the 6-bit events
    //     bitmap (subscribe=true, unsubscribe=true, others=false) and
    //     sources={user,admin,api}=all true.
    //   - Persists webhookId + audienceId + eventTypes + webhookUrl to
    //     trigger_resources.config.
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.locator("[data-status-kind=active]")).toBeVisible({
      timeout: 10_000,
    });

    // ── 9. trigger_resources stores webhookId + audienceId + eventTypes ──
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    expect(triggerRowsAfterActivate).toHaveLength(1);
    const triggerAfterActivate = triggerRowsAfterActivate[0]! as Record<
      string,
      unknown
    >;
    expect(triggerAfterActivate.provider).toBe("mailchimp");
    expect(triggerAfterActivate.event_type).toBe("audience_event");
    const configAfterActivate = triggerAfterActivate.config as {
      type?: string;
      webhookEnabled?: boolean;
      audienceId?: string;
      eventTypes?: readonly string[];
      webhookId?: string;
      webhookUrl?: string;
      adopted?: boolean;
    };
    // Permanent endpoint pattern: NO subscription-watch marker.
    expect(configAfterActivate.type).toBeUndefined();
    expect(configAfterActivate.webhookEnabled).toBe(true);
    expect(configAfterActivate.audienceId).toBe(AUDIENCE_ID);
    expect(configAfterActivate.eventTypes).toEqual(["subscribe", "unsubscribe"]);
    expect(configAfterActivate.webhookId).toMatch(/^wh-mock-/);
    expect(configAfterActivate.webhookUrl).toContain(
      `/api/webhooks/mailchimp?workflowId=${workflowId}&nodeId=trigger-node`,
    );
    expect(configAfterActivate.adopted).toBe(false);
    const triggerNodeId = "trigger-node";

    // ── 10. Mock saw exactly 1 webhook create call with right bitmap ──
    const callsAfterActivate = await fetchMailchimpCalls(request, mock.baseUrl);
    expect(callsAfterActivate.calls.webhookCreate).toHaveLength(1);
    const webhookCreateCall = callsAfterActivate.calls.webhookCreate[0]!;
    expect(webhookCreateCall.audienceId).toBe(AUDIENCE_ID);
    expect(webhookCreateCall.authorization).toBe(
      "Bearer mailchimp-mock-e2e-access",
    );
    expect(webhookCreateCall.parsedBody.url).toContain(
      `/api/webhooks/mailchimp?workflowId=${workflowId}&nodeId=${triggerNodeId}`,
    );
    expect(webhookCreateCall.parsedBody.events).toEqual({
      subscribe: true,
      unsubscribe: true,
      profile: false,
      cleaned: false,
      upemail: false,
      campaign: false,
    });
    expect(webhookCreateCall.parsedBody.sources).toEqual({
      user: true,
      admin: true,
      api: true,
    });

    // ── 11. Send a form-encoded subscribe event ──
    const sendResp = await page.request.post(
      `${mock.baseUrl}/__sendWebhookEvent`,
      {
        data: {
          type: "subscribe",
          audienceId: AUDIENCE_ID,
          email: `webhook-${runMarker}@e2e.test`,
          subscriberHash: `webhookhash${runMarker.slice(0, 8)}`,
          firedAt: "2026-05-10 12:00:00",
          merges: { FNAME: "Webhook", LNAME: "Subscriber" },
          workflowId,
          nodeId: triggerNodeId,
        },
      },
    );
    expect(sendResp.status()).toBe(200);
    const sendBody = (await sendResp.json()) as {
      status: number;
      body: string;
    };
    expect(sendBody.status).toBe(200);

    // ── 12. Workflow run succeeds — action fired ──
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

    // ── 13. Mock saw exactly 1 dc-routed member PUT with decrypted token ──
    const callsAfterRun = await fetchMailchimpCalls(request, mock.baseUrl);
    expect(callsAfterRun.calls.memberPut).toHaveLength(1);
    const memberPutCall = callsAfterRun.calls.memberPut[0]!;
    expect(memberPutCall.audienceId).toBe(AUDIENCE_ID);
    expect(memberPutCall.authorization).toBe(
      "Bearer mailchimp-mock-e2e-access",
    );
    expect(memberPutCall.contentType).toContain("application/json");
    // The subscriberHash = md5(lowercase(email)).
    const expectedHash = createHash("md5")
      .update(subscriberEmail.toLowerCase())
      .digest("hex");
    expect(memberPutCall.subscriberHash).toBe(expectedHash);
    expect(memberPutCall.parsedBody.email_address).toBe(subscriberEmail);
    expect(memberPutCall.parsedBody.status).toBe("pending");
    expect(memberPutCall.parsedBody.status_if_new).toBe("pending");

    // ── 14. Dedup row keyed on sha256(rawBody) ──
    const sentRawBody = callsAfterRun.calls.webhookEvent[0]!.rawBody;
    const sha = createHash("sha256").update(sentRawBody).digest("hex");
    const dedupRow = await getDedupRow("mailchimp", sha);
    expect(dedupRow).not.toBeNull();

    // ── 15. Replay same body → blocked by dedup ──
    const replayResp = await page.request.post(
      `${mock.baseUrl}/__replayLastWebhookEvent`,
    );
    expect(replayResp.status()).toBe(200);
    const replayBody = (await replayResp.json()) as {
      status: number;
      body: string;
    };
    expect(replayBody.status).toBe(200);
    // Receive route still 200-acks (dispatcher reports duplicate=true,
    // dispatched=0), so the 200 from the route doesn't differentiate.
    // Confirm via workflow_runs + member PUT counts.
    await new Promise((r) => setTimeout(r, 1500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(1);
    const callsAfterReplay = await fetchMailchimpCalls(request, mock.baseUrl);
    expect(callsAfterReplay.calls.memberPut).toHaveLength(1);

    // ── 16. Audience-mismatch event → 200 skipped, no run ──
    const mismatchResp = await page.request.post(
      `${mock.baseUrl}/__sendAudienceMismatch`,
      {
        data: {
          type: "subscribe",
          audienceId: AUDIENCE_ID,
          email: `mismatch-${runMarker}@e2e.test`,
          subscriberHash: `mismatchhash${runMarker.slice(0, 8)}`,
          workflowId,
          nodeId: triggerNodeId,
        },
      },
    );
    expect(mismatchResp.status()).toBe(200);
    const mismatchBody = (await mismatchResp.json()) as {
      status: number;
      body: string;
    };
    expect(mismatchBody.status).toBe(200);
    const mismatchParsed = JSON.parse(mismatchBody.body) as {
      ok?: boolean;
      skipped?: boolean;
    };
    expect(mismatchParsed.skipped).toBe(true);
    await new Promise((r) => setTimeout(r, 500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(1);

    // ── 17. Unsupported event-type → 200 skipped, no run ──
    // Default mismatch type is `cleaned` — globally allowlisted but
    // NOT in this workflow's eventTypes selection (subscribe + unsubscribe).
    const unsupportedResp = await page.request.post(
      `${mock.baseUrl}/__sendUnsupportedEventType`,
      {
        data: {
          audienceId: AUDIENCE_ID,
          workflowId,
          nodeId: triggerNodeId,
        },
      },
    );
    expect(unsupportedResp.status()).toBe(200);
    const unsupportedBody = (await unsupportedResp.json()) as {
      status: number;
      body: string;
    };
    expect(unsupportedBody.status).toBe(200);
    const unsupportedParsed = JSON.parse(unsupportedBody.body) as {
      skipped?: boolean;
    };
    expect(unsupportedParsed.skipped).toBe(true);
    await new Promise((r) => setTimeout(r, 500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(1);

    // ── 18. UI: run history shows the succeeded run ──
    await page.goto(`/workflows/${workflowId}`);
    const runHistory = page.locator('section[aria-label="Run history"]');
    await expect(runHistory).toBeVisible();
    await expect(runHistory.getByText(/succeeded/i).first()).toBeVisible();

    // ── 19. No failure notification on success path ──
    expect(await getNotificationsForUser(user.id)).toHaveLength(0);

    // ─────────────────────────────────────────────────────────────────
    // ── 20. Polling-trigger leg — email_opened baseline-first ────────
    // ─────────────────────────────────────────────────────────────────

    // Seed a single sent campaign into the mock at 0 opens; the
    // activation hook will fetch reportSummary and snapshot
    // totalOpens=0. A subsequent poll (after we advance opens) emits
    // exactly one event per new opener.
    const campaignId = `cmp-${runMarker}`;
    const seedResp = await page.request.post(
      `${mock.baseUrl}/__seedCampaign`,
      {
        data: {
          campaignId,
          audienceId: AUDIENCE_ID,
          audienceName: "Mock Audience",
          title: "E2E Campaign",
          subjectLine: "Hello E2E",
          totalOpens: 0,
          status: "sent",
        },
      },
    );
    expect(seedResp.status()).toBe(200);

    // Build a second workflow with email_opened + add_subscriber.
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill(`E2E Mailchimp Polling — ${runMarker}`);
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const pollWorkflowId = page
      .url()
      .match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    const pollDraft = {
      nodes: [
        {
          id: "poll-trigger",
          kind: "trigger" as const,
          provider: "mailchimp",
          type: "email_opened",
          config: { campaignId },
          position: { x: 0, y: 0 },
        },
        {
          id: "poll-action",
          kind: "action" as const,
          provider: "mailchimp",
          type: "add_subscriber",
          config: {
            audience_id: AUDIENCE_ID,
            email: `polled-${runMarker}@e2e.test`,
            status: "pending",
          },
          position: { x: 0, y: 100 },
        },
      ],
      edges: [{ id: "e1", from: "poll-trigger", to: "poll-action" }],
    };
    const pollPatch = await page.request.patch(
      `/api/workflows/${pollWorkflowId}`,
      { data: { draftDefinition: pollDraft } },
    );
    expect(pollPatch.status(), await pollPatch.text()).toBe(200);

    await page.reload();
    // Activate — fires the email_opened activate hook → reportSummary
    // fetch → snapshot { campaigns: { [campaignId]: { totalOpens: 0 } } }.
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.locator("[data-status-kind=active]")).toBeVisible({
      timeout: 10_000,
    });

    // ── 21. Polling trigger_resources row stores baseline snapshot ──
    const pollTriggerRows = await getTriggerResourcesForUser(user.id);
    const pollTrigger = pollTriggerRows.find(
      (r) =>
        (r as Record<string, unknown>).event_type === "email_opened",
    ) as Record<string, unknown> | undefined;
    expect(pollTrigger).toBeTruthy();
    const pollConfig = pollTrigger!.config as {
      pollingEnabled?: boolean;
      campaignId?: string;
      snapshot?: {
        campaigns?: Record<string, { totalOpens: number }>;
        knownOpens?: readonly string[];
        capturedAt?: string;
      };
    };
    expect(pollConfig.pollingEnabled).toBe(true);
    expect(pollConfig.campaignId).toBe(campaignId);
    expect(pollConfig.snapshot?.campaigns?.[campaignId]?.totalOpens).toBe(0);
    expect(pollConfig.snapshot?.knownOpens).toEqual([]);

    // Mock saw a reportSummary call at activation (baseline fetch).
    const callsAfterPollActivate = await fetchMailchimpCalls(
      request,
      mock.baseUrl,
    );
    const summaryCallsAfterActivate =
      callsAfterPollActivate.calls.reportSummary.filter(
        (c) => c.campaignId === campaignId,
      );
    expect(summaryCallsAfterActivate.length).toBeGreaterThanOrEqual(1);

    // ── 22. First poll (no opens delta) emits zero events ──
    // Rewind the polling cursor so the scheduler's 5-min gate doesn't
    // skip this trigger.
    await rewindTriggerPollingTimestamp(pollTrigger!.id as string);
    const pollResp1 = await request.post("/api/cron/poll-triggers", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(pollResp1.status()).toBe(200);
    await new Promise((r) => setTimeout(r, 1500));
    // The audience_event workflow already had 1 succeeded run.
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(1);

    // ── 23. Advance opens + second poll → new event dispatched ──
    const polledOpener = `polled-opener-${runMarker}@e2e.test`;
    const advanceResp = await page.request.post(
      `${mock.baseUrl}/__advanceCampaignOpens`,
      {
        data: {
          campaignId,
          email: polledOpener,
          timestamp: "2026-05-10T12:30:00Z",
        },
      },
    );
    expect(advanceResp.status()).toBe(200);

    await rewindTriggerPollingTimestamp(pollTrigger!.id as string);
    const pollResp2 = await request.post("/api/cron/poll-triggers", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(pollResp2.status()).toBe(200);

    // Expect a SECOND workflow_run from the polling path.
    const allRuns = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length >= 2 ? rows : null;
      },
      {
        description: "polling-trigger workflow_run to appear",
        timeoutMs: 15_000,
      },
    );
    expect(allRuns).toHaveLength(2);
    for (const r of allRuns) {
      expect((r as Record<string, unknown>).status).toBe("succeeded");
    }

    // ── 24. Snapshot persisted: totalOpens advanced + knownOpens grew ──
    const triggerRowsAfterPoll = await getTriggerResourcesForUser(user.id);
    const pollTriggerAfter = triggerRowsAfterPoll.find(
      (r) =>
        (r as Record<string, unknown>).event_type === "email_opened",
    ) as Record<string, unknown> | undefined;
    const pollConfigAfter = pollTriggerAfter!.config as {
      snapshot?: {
        campaigns?: Record<string, { totalOpens: number }>;
        knownOpens?: readonly string[];
      };
      polling?: { lastPolledAt?: string };
    };
    expect(
      pollConfigAfter.snapshot?.campaigns?.[campaignId]?.totalOpens,
    ).toBe(1);
    expect(pollConfigAfter.snapshot?.knownOpens).toContain(
      `${campaignId}:${polledOpener}`,
    );
    expect(pollConfigAfter.polling?.lastPolledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // ── 25. Repeat poll with no further opens → no duplicate run ──
    await rewindTriggerPollingTimestamp(pollTrigger!.id as string);
    const pollResp3 = await request.post("/api/cron/poll-triggers", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(pollResp3.status()).toBe(200);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(2);
  });

  // ─────────────────────────────────────────────────────────────────
  // Mailchimp 2.1 Commit 4 — read-tier actions + unsubscribe
  // ─────────────────────────────────────────────────────────────────

  test("Mailchimp 2.1 — read-tier actions + unsubscribe_subscriber", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMailchimpMockState();
    const runMarker = randomUUID().replace(/-/g, "").slice(0, 12);

    await page.request.post(`${mock.baseUrl}/__reset`);
    await signIn(page, user);

    // Connect Mailchimp.
    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=mailchimp/),
      page
        .getByRole("button", { name: "Connect Mailchimp", exact: true })
        .click(),
    ]);

    // Seed mock state required by the 4 read-tier actions:
    //   - campaignId fixture for get_campaign + get_campaign_stats.
    //   - a couple of list members so get_subscribers returns
    //     bounded, recognizable rows.
    const campaignId = `cmp-${runMarker}`;
    const seededEmail1 = `seeded1-${runMarker}@e2e.test`;
    const seededEmail2 = `seeded2-${runMarker}@e2e.test`;
    const unsubscribeEmail = `unsub-${runMarker}@e2e.test`;

    await page.request.post(`${mock.baseUrl}/__seedCampaign`, {
      data: {
        campaignId,
        audienceId: AUDIENCE_ID,
        audienceName: "Mock Audience",
        title: "E2E 2.1 Campaign",
        subjectLine: "Hello 2.1",
        totalOpens: 7,
        status: "sent",
      },
    });
    await page.request.post(`${mock.baseUrl}/__seedListMembers`, {
      data: {
        listId: AUDIENCE_ID,
        members: [
          { email: seededEmail1, firstName: "First", lastName: "User" },
          { email: seededEmail2, firstName: "Second", lastName: "User" },
        ],
      },
    });

    // Build a workflow that chains 4 read-tier / unsubscribe actions
    // off ONE audience_event subscribe trigger fire. Compressed: one
    // webhook → one workflow_run → four mock calls. Avoids the
    // setup cost of four separate OAuth-connected workflows.
    await page.goto("/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page
      .getByLabel(/workflow name/i)
      .fill(`E2E Mailchimp 2.1 Read+Unsub — ${runMarker}`);
    await Promise.all([
      page.waitForURL(/\/workflows\/[0-9a-f-]+/),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    const workflowId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;

    const draft = {
      nodes: [
        {
          id: "trigger-node",
          kind: "trigger" as const,
          provider: "mailchimp",
          type: "audience_event",
          config: {
            audienceId: AUDIENCE_ID,
            eventTypes: ["subscribe"],
          },
          position: { x: 0, y: 0 },
        },
        {
          id: "get-subs",
          kind: "action" as const,
          provider: "mailchimp",
          type: "get_subscribers",
          config: {
            listId: AUDIENCE_ID,
            status: "subscribed",
            count: 50,
          },
          position: { x: 0, y: 100 },
        },
        {
          id: "get-campaign",
          kind: "action" as const,
          provider: "mailchimp",
          type: "get_campaign",
          config: { campaignId },
          position: { x: 0, y: 200 },
        },
        {
          id: "get-stats",
          kind: "action" as const,
          provider: "mailchimp",
          type: "get_campaign_stats",
          config: { campaignId },
          position: { x: 0, y: 300 },
        },
        {
          id: "unsub",
          kind: "action" as const,
          provider: "mailchimp",
          type: "unsubscribe_subscriber",
          config: {
            listId: AUDIENCE_ID,
            emailAddress: unsubscribeEmail,
          },
          position: { x: 0, y: 400 },
        },
      ],
      edges: [
        { id: "e1", from: "trigger-node", to: "get-subs" },
        { id: "e2", from: "get-subs", to: "get-campaign" },
        { id: "e3", from: "get-campaign", to: "get-stats" },
        { id: "e4", from: "get-stats", to: "unsub" },
      ],
    };
    const patch = await page.request.patch(`/api/workflows/${workflowId}`, {
      data: { draftDefinition: draft },
    });
    expect(patch.status(), await patch.text()).toBe(200);

    await page.reload();
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.locator("[data-status-kind=active]")).toBeVisible({
      timeout: 10_000,
    });

    // Fire one subscribe webhook → workflow_run drives all 4 actions.
    const sendResp = await page.request.post(
      `${mock.baseUrl}/__sendWebhookEvent`,
      {
        data: {
          type: "subscribe",
          audienceId: AUDIENCE_ID,
          email: `incoming-${runMarker}@e2e.test`,
          subscriberHash: `incominghash${runMarker.slice(0, 8)}`,
          firedAt: "2026-05-10 12:00:00",
          merges: { FNAME: "Incoming" },
          workflowId,
          nodeId: "trigger-node",
        },
      },
    );
    expect(sendResp.status()).toBe(200);

    // Workflow run reached completion with all 4 actions firing.
    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length > 0 ? rows : null;
      },
      { description: "read-tier workflow_run to appear", timeoutMs: 15_000 },
    );
    expect(runs).toHaveLength(1);
    const run = runs[0]! as Record<string, unknown>;
    expect(run.status).toBe("succeeded");
    expect(run.error_classification).toBeNull();
    const steps = run.steps as Array<{ nodeId: string; status: string }>;
    const stepMap = new Map(steps.map((s) => [s.nodeId, s.status] as const));
    expect(stepMap.get("get-subs")).toBe("succeeded");
    expect(stepMap.get("get-campaign")).toBe("succeeded");
    expect(stepMap.get("get-stats")).toBe("succeeded");
    expect(stepMap.get("unsub")).toBe("succeeded");

    // Mock saw the 4 wire calls in the expected shape.
    const callsAfter = await fetchMailchimpCalls(request, mock.baseUrl);

    // get_subscribers → GET /3.0/lists/{id}/members with the configured
    // status + count query params.
    expect(callsAfter.calls.membersList).toHaveLength(1);
    const membersCall = callsAfter.calls.membersList[0]!;
    expect(membersCall.audienceId).toBe(AUDIENCE_ID);
    expect(membersCall.authorization).toBe(
      "Bearer mailchimp-mock-e2e-access",
    );
    expect(membersCall.query.status).toBe("subscribed");
    expect(membersCall.query.count).toBe("50");

    // get_campaign → GET /3.0/campaigns/{id}. Only 1 campaign call
    // (the get_campaign action). The activation-time campaignsList
    // baseline calls in Test 1's polling leg don't fire here because
    // this test doesn't activate a polling trigger.
    const campaignGetCalls = callsAfter.calls.campaignGet.filter(
      (c) => c.campaignId === campaignId,
    );
    expect(campaignGetCalls).toHaveLength(1);
    expect(campaignGetCalls[0]!.authorization).toBe(
      "Bearer mailchimp-mock-e2e-access",
    );

    // get_campaign_stats → GET /3.0/reports/{id} via reportGet (same
    // wire path as reportSummary).
    const reportCalls = callsAfter.calls.reportSummary.filter(
      (c) => c.campaignId === campaignId,
    );
    expect(reportCalls).toHaveLength(1);

    // unsubscribe_subscriber → PATCH /3.0/lists/{id}/members/{hash}
    // with body.status = "unsubscribed". No sendGoodbye, no
    // sendNotification, no reason.
    expect(callsAfter.calls.memberPatch).toHaveLength(1);
    const patchCall = callsAfter.calls.memberPatch[0]!;
    expect(patchCall.audienceId).toBe(AUDIENCE_ID);
    const expectedHash = createHash("md5")
      .update(unsubscribeEmail.toLowerCase())
      .digest("hex");
    expect(patchCall.subscriberHash).toBe(expectedHash);
    expect(patchCall.authorization).toBe(
      "Bearer mailchimp-mock-e2e-access",
    );
    expect(patchCall.contentType).toContain("application/json");
    expect(patchCall.parsedBody.status).toBe("unsubscribed");
    expect(patchCall.parsedBody).not.toHaveProperty("sendGoodbye");
    expect(patchCall.parsedBody).not.toHaveProperty("sendNotification");
    expect(patchCall.parsedBody).not.toHaveProperty("reason");
  });

  // ─────────────────────────────────────────────────────────────────
  // Mailchimp 2.1 Commit 4 — parity polling triggers
  // ─────────────────────────────────────────────────────────────────

  test("Mailchimp 2.1 — parity polling triggers (segment members, segment state, new audience)", async ({
    page,
    request,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    const user = testUser;
    const mock = await readMailchimpMockState();
    const cronSecret = requireEnv("CRON_SECRET");
    const runMarker = randomUUID().replace(/-/g, "").slice(0, 12);

    await page.request.post(`${mock.baseUrl}/__reset`);
    await signIn(page, user);

    await page.goto("/integrations");
    await Promise.all([
      page.waitForURL(/\/\?integration=connected&provider=mailchimp/),
      page
        .getByRole("button", { name: "Connect Mailchimp", exact: true })
        .click(),
    ]);

    // ── Seed baseline mock state for the 3 polling triggers ──
    // Two segments: one for subscriber_added_to_segment, one for
    // segment_updated. Each pre-loaded with one baseline member so
    // first-poll-after-activation has something to NOT fire on.
    const segId1 = `${100 + (parseInt(runMarker.slice(0, 4), 16) % 900)}`;
    const segId2 = `${1100 + (parseInt(runMarker.slice(4, 8), 16) % 900)}`;
    const baselineEmail = `baseline-${runMarker}@e2e.test`;
    const baselineHash = createHash("md5")
      .update(baselineEmail.toLowerCase())
      .digest("hex");

    await page.request.post(`${mock.baseUrl}/__seedSegment`, {
      data: {
        audienceId: AUDIENCE_ID,
        segmentId: segId1,
        name: "Subscribers VIP",
        type: "static",
        memberCount: 1,
        updatedAt: "2026-01-01T00:00:00+00:00",
        initialMembers: [{ email: baselineEmail }],
      },
    });
    await page.request.post(`${mock.baseUrl}/__seedSegment`, {
      data: {
        audienceId: AUDIENCE_ID,
        segmentId: segId2,
        name: "Engagement",
        type: "saved",
        memberCount: 5,
        updatedAt: "2026-01-01T00:00:00+00:00",
      },
    });
    // Existing lists for new_audience baseline.
    await page.request.post(`${mock.baseUrl}/__seedList`, {
      data: {
        listId: AUDIENCE_ID,
        name: "Primary Audience",
        company: "Acme",
        dateCreated: "2026-01-01T00:00:00+00:00",
        memberCount: 50,
      },
    });
    await page.request.post(`${mock.baseUrl}/__seedList`, {
      data: {
        listId: `baseline-list-${runMarker}`,
        name: "Existing Audience",
        company: "Acme",
        dateCreated: "2026-01-02T00:00:00+00:00",
        memberCount: 12,
      },
    });

    // Build 3 workflows, one per polling trigger. Each has a
    // simple downstream add_subscriber action so the workflow_run
    // succeeds end-to-end. (The add_subscriber call is unrelated
    // observability — we don't assert on it; we read the
    // trigger_event from the workflow_runs row directly.)
    const triggerSpecs = [
      {
        eventType: "subscriber_added_to_segment",
        triggerConfig: { listId: AUDIENCE_ID, segmentId: segId1 },
        workflowName: `Mailchimp polling — subs add to seg — ${runMarker}`,
      },
      {
        eventType: "segment_updated",
        triggerConfig: { listId: AUDIENCE_ID, segmentId: segId2 },
        workflowName: `Mailchimp polling — segment updated — ${runMarker}`,
      },
      {
        eventType: "new_audience",
        triggerConfig: {},
        workflowName: `Mailchimp polling — new audience — ${runMarker}`,
      },
    ] as const;

    const workflowIds: string[] = [];
    const triggerIdByEventType = new Map<string, string>();

    for (const spec of triggerSpecs) {
      await page.goto("/workflows");
      await page.getByRole("button", { name: "Create workflow" }).click();
      await page.getByLabel(/workflow name/i).fill(spec.workflowName);
      await Promise.all([
        page.waitForURL(/\/workflows\/[0-9a-f-]+/),
        page.getByRole("button", { name: "Create", exact: true }).click(),
      ]);
      const wfId = page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;
      workflowIds.push(wfId);

      const draft = {
        nodes: [
          {
            id: "trigger-node",
            kind: "trigger" as const,
            provider: "mailchimp",
            type: spec.eventType,
            config: spec.triggerConfig,
            position: { x: 0, y: 0 },
          },
          {
            id: "tail-action",
            kind: "action" as const,
            provider: "mailchimp",
            type: "add_subscriber",
            config: {
              audience_id: AUDIENCE_ID,
              email: `tail-${spec.eventType}-${runMarker}@e2e.test`,
              status: "pending",
            },
            position: { x: 0, y: 100 },
          },
        ],
        edges: [{ id: "e1", from: "trigger-node", to: "tail-action" }],
      };
      const patch = await page.request.patch(`/api/workflows/${wfId}`, {
        data: { draftDefinition: draft },
      });
      expect(patch.status(), await patch.text()).toBe(200);

      await page.reload();
      await page.getByRole("button", { name: "Activate" }).click();
      await expect(page.locator("[data-status-kind=active]")).toBeVisible({
        timeout: 10_000,
      });
    }

    // Capture trigger ids per event type for the per-trigger rewind.
    const triggerRowsAfterActivate = await getTriggerResourcesForUser(user.id);
    for (const r of triggerRowsAfterActivate) {
      const row = r as Record<string, unknown>;
      const evType = row.event_type as string;
      const id = row.id as string;
      if (
        evType === "subscriber_added_to_segment" ||
        evType === "segment_updated" ||
        evType === "new_audience"
      ) {
        triggerIdByEventType.set(evType, id);
      }
    }
    expect(triggerIdByEventType.size).toBe(3);

    // ── Baseline assertions — mock saw 3 baseline fetches ──
    const callsAfterActivate = await fetchMailchimpCalls(request, mock.baseUrl);
    // segmentMembersList(seg1) for subscriber_added_to_segment.
    const seg1MembersBaselineCalls =
      callsAfterActivate.calls.segmentMembersList.filter(
        (c) => c.segmentId === segId1,
      );
    expect(seg1MembersBaselineCalls.length).toBeGreaterThanOrEqual(1);
    // segmentGet(seg2) for segment_updated.
    const seg2BaselineCalls = callsAfterActivate.calls.segmentGet.filter(
      (c) => c.segmentId === segId2,
    );
    expect(seg2BaselineCalls.length).toBeGreaterThanOrEqual(1);
    // listsList for new_audience.
    expect(callsAfterActivate.calls.listsList.length).toBeGreaterThanOrEqual(1);

    // Baseline snapshots stored in trigger_resources.config.
    const sasTrigger = triggerRowsAfterActivate.find(
      (r) =>
        (r as Record<string, unknown>).event_type ===
        "subscriber_added_to_segment",
    ) as Record<string, unknown>;
    const sasCfg = sasTrigger.config as {
      snapshot?: { knownSubscriberHashes?: string[] };
    };
    expect(sasCfg.snapshot?.knownSubscriberHashes).toEqual([baselineHash]);

    const segUpdTrigger = triggerRowsAfterActivate.find(
      (r) =>
        (r as Record<string, unknown>).event_type === "segment_updated",
    ) as Record<string, unknown>;
    const segUpdCfg = segUpdTrigger.config as {
      snapshot?: { name?: string; memberCount?: number; type?: string };
    };
    expect(segUpdCfg.snapshot?.name).toBe("Engagement");
    expect(segUpdCfg.snapshot?.memberCount).toBe(5);
    expect(segUpdCfg.snapshot?.type).toBe("saved");

    const newAudTrigger = triggerRowsAfterActivate.find(
      (r) =>
        (r as Record<string, unknown>).event_type === "new_audience",
    ) as Record<string, unknown>;
    const newAudCfg = newAudTrigger.config as {
      snapshot?: { knownListIds?: string[] };
    };
    expect(newAudCfg.snapshot?.knownListIds?.sort()).toEqual(
      [AUDIENCE_ID, `baseline-list-${runMarker}`].sort(),
    );

    // ── First polling tick — no state changes → no runs ──
    for (const id of triggerIdByEventType.values()) {
      await rewindTriggerPollingTimestamp(id);
    }
    const pollResp1 = await request.post("/api/cron/poll-triggers", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(pollResp1.status()).toBe(200);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(0);

    // ── Advance state on all three triggers ──
    // 1. subscriber_added_to_segment: add a new member to seg1.
    const newSegMemberEmail = `newseg-${runMarker}@e2e.test`;
    const newSegMemberHash = createHash("md5")
      .update(newSegMemberEmail.toLowerCase())
      .digest("hex");
    await page.request.post(`${mock.baseUrl}/__addSegmentMember`, {
      data: {
        audienceId: AUDIENCE_ID,
        segmentId: segId1,
        email: newSegMemberEmail,
      },
    });
    // 2. segment_updated: bump member_count on seg2 (also auto-bumps
    //    updated_at).
    const newUpdatedAt = "2026-06-01T12:00:00+00:00";
    await page.request.post(`${mock.baseUrl}/__updateSegment`, {
      data: {
        audienceId: AUDIENCE_ID,
        segmentId: segId2,
        memberCount: 9,
        updatedAt: newUpdatedAt,
      },
    });
    // 3. new_audience: add a fresh list.
    const newListId = `fresh-list-${runMarker}`;
    await page.request.post(`${mock.baseUrl}/__seedList`, {
      data: {
        listId: newListId,
        name: "Fresh Audience",
        company: "Acme",
        dateCreated: "2026-06-01T00:00:00+00:00",
        memberCount: 3,
      },
    });

    // ── Second polling tick — one run per trigger ──
    for (const id of triggerIdByEventType.values()) {
      await rewindTriggerPollingTimestamp(id);
    }
    const pollResp2 = await request.post("/api/cron/poll-triggers", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(pollResp2.status()).toBe(200);

    const runs = await waitFor(
      async () => {
        const rows = await getWorkflowRunsForUser(user.id);
        return rows.length >= 3 ? rows : null;
      },
      {
        description: "3 polling-trigger workflow_runs to appear",
        timeoutMs: 15_000,
      },
    );
    expect(runs).toHaveLength(3);
    for (const r of runs) {
      expect((r as Record<string, unknown>).status).toBe("succeeded");
    }

    // ── Payload assertions — read trigger_event off each run ──
    const runByWorkflow = new Map<string, Record<string, unknown>>();
    for (const r of runs) {
      const row = r as Record<string, unknown>;
      runByWorkflow.set(row.workflow_id as string, row);
    }
    // subscriber_added_to_segment payload.
    const sasRun = runByWorkflow.get(workflowIds[0]!)!;
    const sasEvent = sasRun.trigger_event as {
      eventType: string;
      eventId: string;
      payload: Record<string, unknown>;
    };
    expect(sasEvent.eventType).toBe("subscriber_added_to_segment");
    expect(sasEvent.eventId).toBe(
      `subscriber_added_to_segment:${segId1}:${newSegMemberHash}`,
    );
    expect(sasEvent.payload.listId).toBe(AUDIENCE_ID);
    expect(sasEvent.payload.segmentId).toBe(segId1);
    expect(sasEvent.payload.subscriberHash).toBe(newSegMemberHash);
    expect(sasEvent.payload.emailAddress).toBe(newSegMemberEmail);
    expect(sasEvent.payload.status).toBe("subscribed");

    // segment_updated payload.
    const segUpdRun = runByWorkflow.get(workflowIds[1]!)!;
    const segUpdEvent = segUpdRun.trigger_event as {
      eventType: string;
      eventId: string;
      payload: Record<string, unknown>;
    };
    expect(segUpdEvent.eventType).toBe("segment_updated");
    expect(segUpdEvent.eventId).toBe(`segment_updated:${segId2}:${newUpdatedAt}`);
    expect(segUpdEvent.payload.listId).toBe(AUDIENCE_ID);
    expect(segUpdEvent.payload.segmentId).toBe(segId2);
    expect(segUpdEvent.payload.name).toBe("Engagement");
    expect(segUpdEvent.payload.memberCount).toBe(9);
    expect(segUpdEvent.payload.type).toBe("saved");
    expect(segUpdEvent.payload.updatedAt).toBe(newUpdatedAt);

    // new_audience payload.
    const newAudRun = runByWorkflow.get(workflowIds[2]!)!;
    const newAudEvent = newAudRun.trigger_event as {
      eventType: string;
      eventId: string;
      payload: Record<string, unknown>;
    };
    expect(newAudEvent.eventType).toBe("new_audience");
    expect(newAudEvent.eventId).toBe(`new_audience:${newListId}`);
    expect(newAudEvent.payload.listId).toBe(newListId);
    expect(newAudEvent.payload.name).toBe("Fresh Audience");
    expect(newAudEvent.payload.company).toBe("Acme");
    expect(newAudEvent.payload.memberCount).toBe(3);
    expect(newAudEvent.payload.dateCreated).toBe("2026-06-01T00:00:00+00:00");

    // ── Third tick — no further changes → no duplicate runs ──
    for (const id of triggerIdByEventType.values()) {
      await rewindTriggerPollingTimestamp(id);
    }
    const pollResp3 = await request.post("/api/cron/poll-triggers", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(pollResp3.status()).toBe(200);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await getWorkflowRunsForUser(user.id)).toHaveLength(3);
  });
});

// ── helpers ───────────────────────────────────────────────────────────

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

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`e2e: ${name} env var is required`);
  return v;
}

interface MailchimpMockInspect {
  calls: {
    authorize: {
      state: string;
      redirectUri: string | null;
      responseType: string | null;
      clientId: string | null;
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
    metadata: { authorization: string | undefined }[];
    apiRoot: { authorization: string | undefined }[];
    memberPut: {
      audienceId: string;
      subscriberHash: string;
      authorization: string | undefined;
      contentType: string | undefined;
      body: string;
      parsedBody: Record<string, unknown>;
    }[];
    memberPatch: {
      audienceId: string;
      subscriberHash: string;
      authorization: string | undefined;
      contentType: string | undefined;
      body: string;
      parsedBody: Record<string, unknown>;
    }[];
    membersList: {
      audienceId: string;
      authorization: string | undefined;
      query: Record<string, string>;
    }[];
    tagsPost: unknown[];
    webhookCreate: {
      audienceId: string;
      authorization: string | undefined;
      body: string;
      parsedBody: {
        url?: string;
        events?: Record<string, boolean>;
        sources?: Record<string, boolean>;
      };
      responseWebhookId: string;
    }[];
    webhookDelete: unknown[];
    webhookList: unknown[];
    webhookPatch: unknown[];
    campaignsList: { authorization: string | undefined; query: Record<string, string> }[];
    campaignGet: { campaignId: string; authorization: string | undefined }[];
    reportSummary: {
      campaignId: string;
      authorization: string | undefined;
    }[];
    segmentGet: {
      audienceId: string;
      segmentId: string;
      authorization: string | undefined;
    }[];
    segmentMembersList: {
      audienceId: string;
      segmentId: string;
      authorization: string | undefined;
      query: Record<string, string>;
    }[];
    listsList: {
      authorization: string | undefined;
      query: Record<string, string>;
    }[];
    webhookEvent: {
      type: string;
      audienceId: string;
      url: string;
      rawBody: string;
      status: number;
      responseBody: string;
    }[];
  };
}

async function fetchMailchimpCalls(
  request: APIRequestContext,
  mockBaseUrl: string,
): Promise<MailchimpMockInspect> {
  const resp = await request.get(`${mockBaseUrl}/__inspect`);
  return (await resp.json()) as MailchimpMockInspect;
}
