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
