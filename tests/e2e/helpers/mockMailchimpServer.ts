import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";

/**
 * Standalone mock Mailchimp server for the Slice 14 e2e walkthrough.
 *
 * V2's first email-marketing provider AND first per-datacenter API-host
 * routing model. Mailchimp does NOT sign webhooks — V2 authenticates
 * via URL secrecy (workflowId + nodeId), audienceId match, event-type
 * allowlist, and sha256(rawBody) DB-backed dedup.
 *
 * Routes (real Mailchimp surface):
 *   - OAuth
 *     GET  /oauth2/authorize                        → 302 to redirect_uri
 *     POST /oauth2/token                            → body-auth, JSON
 *     GET  /oauth2/metadata                         → returns dc + accountname +
 *                                                     login.email + api_endpoint.
 *                                                     Header MUST be
 *                                                     `Authorization: OAuth <token>`
 *                                                     (Mailchimp's legacy
 *                                                     header — NOT Bearer).
 *   - REST `/3.0/...` (per-dc, but env override collapses to one origin)
 *     GET  /3.0/                                    → account_id + name + email.
 *     PUT  /3.0/lists/{audienceId}/members/{hash}   → upsert subscriber.
 *     POST /3.0/lists/{audienceId}/members/{hash}/tags → add/remove tags.
 *     POST /3.0/lists/{audienceId}/webhooks         → create webhook (returns id).
 *     DELETE /3.0/lists/{audienceId}/webhooks/{id}  → delete webhook.
 *     GET  /3.0/lists/{audienceId}/webhooks         → list webhooks (duplicate-URL recovery).
 *     PATCH /3.0/lists/{audienceId}/webhooks/{id}   → patch events bitmap.
 *     GET  /3.0/campaigns                           → list campaigns.
 *     GET  /3.0/campaigns/{id}                      → get campaign.
 *     GET  /3.0/reports/{campaignId}                → report summary.
 *
 * Control plane (test-only):
 *   POST /__sendWebhookEvent       → form-encode + POST a Mailchimp
 *                                    event body to the configured webhook
 *                                    URL. Body: `{ type, audienceId, email?,
 *                                    subscriberHash?, firedAt?, merges?,
 *                                    workflowId, nodeId }`. Records the
 *                                    raw body for sha256 dedup verification.
 *   POST /__replayLastWebhookEvent → POST the same raw body to the same
 *                                    URL — tests dedup.
 *   POST /__sendAudienceMismatch   → send a valid event with a different
 *                                    audienceId — must 200-ack with skip.
 *   POST /__sendUnsupportedEventType → send `type` outside the allowlist
 *                                      OR outside the workflow's selection.
 *   POST /__advanceCampaignOpens   → bump totalOpens on a campaign +
 *                                    add a member to open-details. Used by
 *                                    polling spec to drive the second poll.
 *   POST /__reset                  → clear all state.
 *   GET  /__inspect                → dump calls + state.
 *
 * Fixed port (default 9885, override via MAILCHIMP_MOCK_PORT). Distinct
 * from Slack (9876), Google (9877), Microsoft (9878), Notion (9879),
 * Airtable (9880), Stripe (9881), Shopify (9882), HubSpot (9883),
 * GitHub (9884).
 */

export interface RecordedAuthorize {
  state: string;
  redirectUri: string | null;
  responseType: string | null;
  clientId: string | null;
  /** Anti-test for V2 accidentally sending `scope=`. */
  scope: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
}

export interface RecordedTokenExchange {
  authorization: string | undefined;
  contentType: string | undefined;
  body: string;
  parsedBody: Record<string, string>;
}

export interface RecordedMetadataCall {
  /** MUST be `OAuth <token>`. */
  authorization: string | undefined;
}

export interface RecordedApiRootCall {
  /** MUST be `Bearer <token>`. */
  authorization: string | undefined;
}

export interface RecordedMemberPut {
  audienceId: string;
  subscriberHash: string;
  authorization: string | undefined;
  contentType: string | undefined;
  body: string;
  parsedBody: Record<string, unknown>;
}

export interface RecordedTagsPost {
  audienceId: string;
  subscriberHash: string;
  authorization: string | undefined;
  body: string;
  parsedBody: Record<string, unknown>;
}

export interface RecordedWebhookCreate {
  audienceId: string;
  authorization: string | undefined;
  body: string;
  parsedBody: {
    url?: string;
    events?: Record<string, boolean>;
    sources?: Record<string, boolean>;
  };
  responseWebhookId: string;
}

export interface RecordedWebhookDelete {
  audienceId: string;
  webhookId: string;
  authorization: string | undefined;
}

export interface RecordedWebhookList {
  audienceId: string;
  authorization: string | undefined;
}

export interface RecordedWebhookPatch {
  audienceId: string;
  webhookId: string;
  body: string;
}

export interface RecordedCampaignsList {
  authorization: string | undefined;
  query: Record<string, string>;
}

export interface RecordedCampaignGet {
  campaignId: string;
  authorization: string | undefined;
}

export interface RecordedReportSummary {
  campaignId: string;
  authorization: string | undefined;
}

export interface RecordedWebhookEvent {
  type: string;
  audienceId: string;
  url: string;
  rawBody: string;
  status: number;
  responseBody: string;
}

export interface MockMailchimpHandle {
  port: number;
  baseUrl: string;
  calls: {
    authorize: RecordedAuthorize[];
    tokenExchange: RecordedTokenExchange[];
    metadata: RecordedMetadataCall[];
    apiRoot: RecordedApiRootCall[];
    memberPut: RecordedMemberPut[];
    tagsPost: RecordedTagsPost[];
    webhookCreate: RecordedWebhookCreate[];
    webhookDelete: RecordedWebhookDelete[];
    webhookList: RecordedWebhookList[];
    webhookPatch: RecordedWebhookPatch[];
    campaignsList: RecordedCampaignsList[];
    campaignGet: RecordedCampaignGet[];
    reportSummary: RecordedReportSummary[];
    webhookEvent: RecordedWebhookEvent[];
  };
  reset(): void;
  stop(): Promise<void>;
}

const DEFAULT_PORT = Number(process.env.MAILCHIMP_MOCK_PORT ?? "9885");

interface MockCampaign {
  id: string;
  status: string;
  create_time: string;
  send_time?: string;
  recipients: { list_id: string; list_name: string };
  settings: {
    title: string;
    subject_line: string;
    from_name: string;
    reply_to: string;
  };
  totalOpens: number;
  openDetails: Array<{ email_address: string; opens_count: number; opens: Array<{ timestamp: string }> }>;
}

interface LastWebhookEvent {
  type: string;
  audienceId: string;
  rawBody: string;
  url: string;
}

interface MutableState {
  calls: MockMailchimpHandle["calls"];
  webhooks: Map<string, { id: string; audienceId: string; url: string; events: Record<string, boolean>; sources: Record<string, boolean> }>;
  webhookCounter: number;
  campaigns: Map<string, MockCampaign>;
  lastWebhookEvent: LastWebhookEvent | null;
  // Fixture identifiers reused across tests.
  account: {
    accountId: string;
    accountName: string;
    email: string;
    dc: string;
  };
}

function freshState(): MutableState {
  return {
    calls: {
      authorize: [],
      tokenExchange: [],
      metadata: [],
      apiRoot: [],
      memberPut: [],
      tagsPost: [],
      webhookCreate: [],
      webhookDelete: [],
      webhookList: [],
      webhookPatch: [],
      campaignsList: [],
      campaignGet: [],
      reportSummary: [],
      webhookEvent: [],
    },
    webhooks: new Map(),
    webhookCounter: 0,
    campaigns: new Map(),
    lastWebhookEvent: null,
    account: {
      accountId: "8d3a3db4d97663a9074efcc16",
      accountName: "Acme Corp E2E",
      email: "owner@acme-e2e.test",
      dc: "us21",
    },
  };
}

export interface StartMockMailchimpOptions {
  appBaseUrl: string;
  port?: number;
}

export async function startMockMailchimpServer(
  opts: StartMockMailchimpOptions,
): Promise<MockMailchimpHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const state = freshState();

  const server: Server = createServer((req, res) => {
    handleRequest(req, res, opts, state).catch((err) => {
      console.error("[mock-mailchimp] handler crashed", err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("mock-mailchimp handler crashed");
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    get calls() {
      return state.calls;
    },
    reset: () => Object.assign(state, freshState()),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: StartMockMailchimpOptions,
  state: MutableState,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://placeholder");

  // ── OAuth ──
  if (req.method === "GET" && url.pathname === "/oauth2/authorize") {
    return handleAuthorize(res, opts.appBaseUrl, state, url);
  }
  if (req.method === "POST" && url.pathname === "/oauth2/token") {
    return handleTokenExchange(req, res, state);
  }
  if (req.method === "GET" && url.pathname === "/oauth2/metadata") {
    return handleMetadata(req, res, state);
  }

  // ── REST /3.0/ ──
  if (req.method === "GET" && url.pathname === "/3.0/") {
    return handleApiRoot(req, res, state);
  }

  // PUT /3.0/lists/{audienceId}/members/{subscriberHash}
  const memberPutMatch = url.pathname.match(
    /^\/3\.0\/lists\/([^/]+)\/members\/([^/]+)$/,
  );
  if (req.method === "PUT" && memberPutMatch) {
    return handleMemberPut(req, res, state, memberPutMatch[1]!, memberPutMatch[2]!);
  }

  // POST /3.0/lists/{audienceId}/members/{subscriberHash}/tags
  const tagsMatch = url.pathname.match(
    /^\/3\.0\/lists\/([^/]+)\/members\/([^/]+)\/tags$/,
  );
  if (req.method === "POST" && tagsMatch) {
    return handleTagsPost(req, res, state, tagsMatch[1]!, tagsMatch[2]!);
  }

  // POST /3.0/lists/{audienceId}/webhooks
  const webhookCreateMatch = url.pathname.match(
    /^\/3\.0\/lists\/([^/]+)\/webhooks$/,
  );
  if (req.method === "POST" && webhookCreateMatch) {
    return handleWebhookCreate(req, res, state, webhookCreateMatch[1]!);
  }
  if (req.method === "GET" && webhookCreateMatch) {
    return handleWebhookList(req, res, state, webhookCreateMatch[1]!);
  }

  // DELETE /3.0/lists/{audienceId}/webhooks/{webhookId}
  const webhookDeleteMatch = url.pathname.match(
    /^\/3\.0\/lists\/([^/]+)\/webhooks\/([^/]+)$/,
  );
  if (req.method === "DELETE" && webhookDeleteMatch) {
    return handleWebhookDelete(
      req,
      res,
      state,
      webhookDeleteMatch[1]!,
      webhookDeleteMatch[2]!,
    );
  }
  if (req.method === "PATCH" && webhookDeleteMatch) {
    return handleWebhookPatch(
      req,
      res,
      state,
      webhookDeleteMatch[1]!,
      webhookDeleteMatch[2]!,
    );
  }

  // GET /3.0/campaigns
  if (req.method === "GET" && url.pathname === "/3.0/campaigns") {
    return handleCampaignsList(req, res, state, url);
  }
  // GET /3.0/campaigns/{id}
  const campaignGetMatch = url.pathname.match(/^\/3\.0\/campaigns\/([^/]+)$/);
  if (req.method === "GET" && campaignGetMatch) {
    return handleCampaignGet(req, res, state, campaignGetMatch[1]!);
  }
  // GET /3.0/reports/{campaignId}/open-details (must match BEFORE
  // the generic /reports/{id} route — order matters).
  const openDetailsMatch = url.pathname.match(
    /^\/3\.0\/reports\/([^/]+)\/open-details$/,
  );
  if (req.method === "GET" && openDetailsMatch) {
    return handleReportOpenDetails(req, res, state, openDetailsMatch[1]!, url);
  }
  // GET /3.0/reports/{campaignId}/click-details
  const clickDetailsMatch = url.pathname.match(
    /^\/3\.0\/reports\/([^/]+)\/click-details$/,
  );
  if (req.method === "GET" && clickDetailsMatch) {
    return handleReportClickDetails(req, res, state, clickDetailsMatch[1]!);
  }
  // GET /3.0/reports/{campaignId}/click-details/{urlId}/members
  const clickMembersMatch = url.pathname.match(
    /^\/3\.0\/reports\/([^/]+)\/click-details\/([^/]+)\/members$/,
  );
  if (req.method === "GET" && clickMembersMatch) {
    return handleReportClickMembers(
      req,
      res,
      state,
      clickMembersMatch[1]!,
      clickMembersMatch[2]!,
    );
  }
  // GET /3.0/reports/{campaignId} (catch-all summary)
  const reportMatch = url.pathname.match(/^\/3\.0\/reports\/([^/]+)$/);
  if (req.method === "GET" && reportMatch) {
    return handleReportSummary(req, res, state, reportMatch[1]!);
  }

  // ── Control plane ──
  if (req.method === "POST" && url.pathname === "/__sendWebhookEvent") {
    return handleSendWebhookEvent(req, res, opts, state, /* mismatch */ false);
  }
  if (req.method === "POST" && url.pathname === "/__replayLastWebhookEvent") {
    return handleReplayLastWebhookEvent(res, state);
  }
  if (req.method === "POST" && url.pathname === "/__sendAudienceMismatch") {
    return handleSendWebhookEvent(req, res, opts, state, /* mismatch */ true);
  }
  if (req.method === "POST" && url.pathname === "/__sendUnsupportedEventType") {
    return handleSendUnsupportedEventType(req, res, opts, state);
  }
  if (req.method === "POST" && url.pathname === "/__seedCampaign") {
    return handleSeedCampaign(req, res, state);
  }
  if (req.method === "POST" && url.pathname === "/__advanceCampaignOpens") {
    return handleAdvanceCampaignOpens(req, res, state);
  }
  if (req.method === "POST" && url.pathname === "/__reset") {
    Object.assign(state, freshState());
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/__inspect") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        calls: state.calls,
        webhooks: Array.from(state.webhooks.values()),
        campaigns: Array.from(state.campaigns.values()),
      }),
    );
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end(`mock-mailchimp: unhandled ${req.method} ${url.pathname}`);
}

// ── OAuth handlers ─────────────────────────────────────────────────────

async function handleAuthorize(
  res: ServerResponse,
  appBaseUrl: string,
  state: MutableState,
  url: URL,
): Promise<void> {
  const stateParam = url.searchParams.get("state");
  if (!stateParam) {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("missing state");
    return;
  }
  state.calls.authorize.push({
    state: stateParam,
    redirectUri: url.searchParams.get("redirect_uri"),
    responseType: url.searchParams.get("response_type"),
    clientId: url.searchParams.get("client_id"),
    scope: url.searchParams.get("scope"),
    codeChallenge: url.searchParams.get("code_challenge"),
    codeChallengeMethod: url.searchParams.get("code_challenge_method"),
  });
  const callback = url.searchParams.get("redirect_uri")
    ? new URL(url.searchParams.get("redirect_uri")!)
    : new URL("/api/integrations/oauth/mailchimp/callback", appBaseUrl);
  callback.searchParams.set("code", `mock-mailchimp-code-${Date.now()}`);
  callback.searchParams.set("state", stateParam);
  res.writeHead(302, { location: callback.toString() });
  res.end();
}

async function handleTokenExchange(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const contentType = req.headers["content-type"] as string | undefined;
  const body = await readBody(req);
  const parsed = parseFormBody(body);
  state.calls.tokenExchange.push({
    authorization: authHeader,
    contentType,
    body,
    parsedBody: parsed,
  });

  // Body-auth: client_secret MUST be in the form body. Mailchimp uses
  // body-auth, NOT Basic header.
  if (authHeader && authHeader.startsWith("Basic ")) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "invalid_client",
        error_description:
          "Mailchimp uses body-auth (client_secret in body), not Basic auth.",
      }),
    );
    return;
  }
  if (
    !contentType?.toLowerCase().includes("application/x-www-form-urlencoded")
  ) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "invalid_request",
        error_description:
          "Content-Type must be application/x-www-form-urlencoded.",
      }),
    );
    return;
  }
  if (!parsed.client_secret) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "invalid_client",
        error_description: "client_secret required in body.",
      }),
    );
    return;
  }
  if (parsed.grant_type !== "authorization_code") {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "unsupported_grant_type",
        error_description: `unsupported grant_type ${parsed.grant_type ?? "<missing>"}.`,
      }),
    );
    return;
  }

  // Mailchimp's token response shape — NO refresh_token, expires_in: 0
  // sentinel (V2 normalizes to null).
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      access_token: "mailchimp-mock-e2e-access",
      expires_in: 0,
      scope: null,
      token_type: "bearer",
    }),
  );
}

async function handleMetadata(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  const authHeader = req.headers.authorization;
  state.calls.metadata.push({ authorization: authHeader });

  // Mailchimp's legacy header scheme — MUST be `OAuth <token>`, not Bearer.
  if (!authHeader || !authHeader.startsWith("OAuth ")) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "invalid_auth_scheme",
        error_description: "Mailchimp metadata endpoint requires Authorization: OAuth <token>.",
      }),
    );
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      dc: state.account.dc,
      role: "owner",
      accountname: state.account.accountName,
      user_id: 12345678,
      login: {
        email: state.account.email,
        login_email: state.account.email,
        login_name: "owner",
      },
      login_url: "https://login.mailchimp.com",
      // The api_endpoint field — diagnostic only; V2 uses dc to route.
      api_endpoint: `https://${state.account.dc}.api.mailchimp.com`,
    }),
  );
}

async function handleApiRoot(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  const authHeader = req.headers.authorization;
  state.calls.apiRoot.push({ authorization: authHeader });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      account_id: state.account.accountId,
      account_name: state.account.accountName,
      email: state.account.email,
      username: "owner",
      total_subscribers: 0,
    }),
  );
}

// ── REST /3.0/ handlers ────────────────────────────────────────────────

async function handleMemberPut(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  audienceId: string,
  subscriberHash: string,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const contentType = req.headers["content-type"] as string | undefined;
  const body = await readBody(req);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = body.length > 0 ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ detail: "invalid json" }));
    return;
  }
  state.calls.memberPut.push({
    audienceId,
    subscriberHash,
    authorization: authHeader,
    contentType,
    body,
    parsedBody: parsed,
  });
  const email = (parsed.email_address as string | undefined) ?? "unknown@e2e.test";
  const status = (parsed.status as string | undefined) ?? "subscribed";
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: subscriberHash,
      email_address: email,
      unique_email_id: `mock-uid-${subscriberHash.slice(0, 6)}`,
      status,
      list_id: audienceId,
      merge_fields: parsed.merge_fields ?? {},
      tags: Array.isArray(parsed.tags)
        ? (parsed.tags as string[]).map((name, i) => ({ id: 100 + i, name }))
        : [],
      timestamp_opt: new Date().toISOString(),
      timestamp_signup: new Date().toISOString(),
      last_changed: new Date().toISOString(),
    }),
  );
}

async function handleTagsPost(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  audienceId: string,
  subscriberHash: string,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const body = await readBody(req);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = body.length > 0 ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ detail: "invalid json" }));
    return;
  }
  state.calls.tagsPost.push({
    audienceId,
    subscriberHash,
    authorization: authHeader,
    body,
    parsedBody: parsed,
  });
  res.writeHead(204);
  res.end();
}

async function handleWebhookCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  audienceId: string,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const body = await readBody(req);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = body.length > 0 ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ detail: "invalid json" }));
    return;
  }
  const url = (parsed.url as string | undefined) ?? "";
  // Reject duplicate URLs to exercise V2's `webhooksCreateOrAdopt`
  // recovery path on reactivation (not exercised in the happy-path
  // spec, but kept here for completeness).
  for (const w of state.webhooks.values()) {
    if (w.audienceId === audienceId && w.url === url) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          type: "...",
          title: "Resource Conflict",
          detail:
            "Sorry, you can't set up multiple WebHooks for one URL on the same list.",
          status: 400,
        }),
      );
      return;
    }
  }
  state.webhookCounter += 1;
  const webhookId = `wh-mock-${state.webhookCounter}`;
  const events = (parsed.events as Record<string, boolean> | undefined) ?? {};
  const sources = (parsed.sources as Record<string, boolean> | undefined) ?? {};
  state.webhooks.set(webhookId, {
    id: webhookId,
    audienceId,
    url,
    events,
    sources,
  });
  state.calls.webhookCreate.push({
    audienceId,
    authorization: authHeader,
    body,
    parsedBody: { url, events, sources },
    responseWebhookId: webhookId,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: webhookId,
      url,
      events,
      sources,
      list_id: audienceId,
    }),
  );
}

async function handleWebhookList(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  audienceId: string,
): Promise<void> {
  state.calls.webhookList.push({
    audienceId,
    authorization: req.headers.authorization,
  });
  const webhooks = Array.from(state.webhooks.values()).filter(
    (w) => w.audienceId === audienceId,
  );
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({ webhooks, list_id: audienceId, total_items: webhooks.length }),
  );
}

async function handleWebhookDelete(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  audienceId: string,
  webhookId: string,
): Promise<void> {
  state.calls.webhookDelete.push({
    audienceId,
    webhookId,
    authorization: req.headers.authorization,
  });
  state.webhooks.delete(webhookId);
  res.writeHead(204);
  res.end();
}

async function handleWebhookPatch(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  audienceId: string,
  webhookId: string,
): Promise<void> {
  const body = await readBody(req);
  state.calls.webhookPatch.push({ audienceId, webhookId, body });
  const existing = state.webhooks.get(webhookId);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: webhookId,
      url: existing?.url ?? "",
      events: existing?.events ?? {},
      sources: existing?.sources ?? {},
      list_id: audienceId,
    }),
  );
}

async function handleCampaignsList(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  url: URL,
): Promise<void> {
  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) query[k] = v;
  state.calls.campaignsList.push({
    authorization: req.headers.authorization,
    query,
  });
  let campaigns = Array.from(state.campaigns.values());
  if (query.status) campaigns = campaigns.filter((c) => c.status === query.status);
  if (query.list_id) {
    campaigns = campaigns.filter((c) => c.recipients.list_id === query.list_id);
  }
  // Sort: send_time / create_time DESC.
  const sortField = query.sort_field === "send_time" ? "send_time" : "create_time";
  const sortDir = query.sort_dir === "ASC" ? 1 : -1;
  campaigns.sort((a, b) => {
    const av = (sortField === "send_time" ? a.send_time : a.create_time) ?? "";
    const bv = (sortField === "send_time" ? b.send_time : b.create_time) ?? "";
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      campaigns: campaigns.map(stripCampaignForListing),
      total_items: campaigns.length,
    }),
  );
}

async function handleCampaignGet(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  campaignId: string,
): Promise<void> {
  state.calls.campaignGet.push({
    campaignId,
    authorization: req.headers.authorization,
  });
  const c = state.campaigns.get(campaignId);
  if (!c) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ detail: `campaign ${campaignId} not found` }));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(stripCampaignForListing(c)));
}

async function handleReportSummary(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  campaignId: string,
): Promise<void> {
  state.calls.reportSummary.push({
    campaignId,
    authorization: req.headers.authorization,
  });
  const c = state.campaigns.get(campaignId);
  if (!c) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ detail: `campaign ${campaignId} not found` }));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: campaignId,
      campaign_title: c.settings.title,
      subject_line: c.settings.subject_line,
      list_id: c.recipients.list_id,
      list_name: c.recipients.list_name,
      emails_sent: 100,
      opens: { opens_total: c.totalOpens, unique_opens: c.totalOpens },
      clicks: { clicks_total: 0, unique_clicks: 0 },
      bounces: { hard_bounces: 0, soft_bounces: 0 },
    }),
  );
}

async function handleReportOpenDetails(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  campaignId: string,
  url: URL,
): Promise<void> {
  void req;
  void url;
  const c = state.campaigns.get(campaignId);
  if (!c) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ detail: `report ${campaignId} not found` }),
    );
    return;
  }
  // openDetails is unshifted-on-advance so element[0] is the
  // most-recent — that matches the wire-format the wrapper expects
  // (sort=timestamp DESC).
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      campaign_id: campaignId,
      members: c.openDetails.map((m) => ({
        email_id: `mock-uid-${m.email_address.replace(/[^a-z0-9]/gi, "")}`,
        email_address: m.email_address,
        list_id: c.recipients.list_id,
        opens: m.opens,
        opens_count: m.opens_count,
      })),
      total_items: c.openDetails.length,
    }),
  );
}

async function handleReportClickDetails(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  campaignId: string,
): Promise<void> {
  void req;
  const c = state.campaigns.get(campaignId);
  if (!c) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ detail: `report ${campaignId} not found` }));
    return;
  }
  // No click-details fixture in this slice's e2e; return empty. Kept
  // wired so the link_clicked polling handler doesn't 404 if a
  // future test exercises it.
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      campaign_id: campaignId,
      urls_clicked: [],
      total_items: 0,
    }),
  );
}

async function handleReportClickMembers(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  campaignId: string,
  urlId: string,
): Promise<void> {
  void req;
  void state;
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      campaign_id: campaignId,
      url_id: urlId,
      members: [],
      total_items: 0,
    }),
  );
}

function stripCampaignForListing(c: MockCampaign): Record<string, unknown> {
  return {
    id: c.id,
    status: c.status,
    create_time: c.create_time,
    send_time: c.send_time,
    recipients: c.recipients,
    settings: c.settings,
  };
}

// ── Control-plane handlers ────────────────────────────────────────────

interface SendWebhookEventPayload {
  type: string;
  audienceId: string;
  email?: string;
  subscriberHash?: string;
  firedAt?: string;
  merges?: Record<string, string>;
  workflowId: string;
  nodeId: string;
}

async function handleSendWebhookEvent(
  req: IncomingMessage,
  res: ServerResponse,
  opts: StartMockMailchimpOptions,
  state: MutableState,
  mismatch: boolean,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: SendWebhookEventPayload;
  try {
    payload = JSON.parse(bodyText) as SendWebhookEventPayload;
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid json" }));
    return;
  }
  if (!payload.type || !payload.audienceId || !payload.workflowId || !payload.nodeId) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "type + audienceId + workflowId + nodeId required",
      }),
    );
    return;
  }
  // Mismatch mode: deliver with a deliberately-different audienceId in
  // the form body so V2's audienceId-match gate kicks in.
  const formBody = buildMailchimpFormBody({
    type: payload.type,
    audienceId: mismatch ? "different-audience-mock" : payload.audienceId,
    email: payload.email ?? "subscriber@e2e.test",
    subscriberHash: payload.subscriberHash ?? "mockhash01234567",
    firedAt: payload.firedAt ?? "2026-01-01 12:00:00",
    merges: payload.merges ?? {},
  });
  const webhookUrl = `${opts.appBaseUrl}/api/webhooks/mailchimp?workflowId=${encodeURIComponent(payload.workflowId)}&nodeId=${encodeURIComponent(payload.nodeId)}`;
  state.lastWebhookEvent = {
    type: payload.type,
    audienceId: payload.audienceId,
    rawBody: formBody,
    url: webhookUrl,
  };
  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    type: payload.type,
    audienceId: payload.audienceId,
    url: webhookUrl,
    rawBody: formBody,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: resp.status, body: responseBody }));
}

async function handleReplayLastWebhookEvent(
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  if (!state.lastWebhookEvent) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "no prior event to replay" }));
    return;
  }
  const last = state.lastWebhookEvent;
  const resp = await fetch(last.url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: last.rawBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    type: last.type,
    audienceId: last.audienceId,
    url: last.url,
    rawBody: last.rawBody,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: resp.status, body: responseBody }));
}

interface SendUnsupportedPayload {
  type?: string;
  audienceId: string;
  workflowId: string;
  nodeId: string;
}

async function handleSendUnsupportedEventType(
  req: IncomingMessage,
  res: ServerResponse,
  opts: StartMockMailchimpOptions,
  state: MutableState,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: SendUnsupportedPayload;
  try {
    payload = JSON.parse(bodyText) as SendUnsupportedPayload;
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid json" }));
    return;
  }
  // Default: send `cleaned` — globally allowlisted but presumably NOT
  // in the workflow's eventTypes selection. The spec activates
  // `[subscribe, unsubscribe]` so `cleaned` falls into the second
  // filter layer (workflow-subscribed allowlist).
  const type = payload.type ?? "cleaned";
  const formBody = buildMailchimpFormBody({
    type,
    audienceId: payload.audienceId,
    email: "skipped@e2e.test",
    subscriberHash: "skiphash01234567",
    firedAt: "2026-01-01 12:00:00",
    merges: {},
  });
  const webhookUrl = `${opts.appBaseUrl}/api/webhooks/mailchimp?workflowId=${encodeURIComponent(payload.workflowId)}&nodeId=${encodeURIComponent(payload.nodeId)}`;
  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    type,
    audienceId: payload.audienceId,
    url: webhookUrl,
    rawBody: formBody,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: resp.status, body: responseBody }));
}

interface SeedCampaignPayload {
  campaignId: string;
  audienceId: string;
  audienceName?: string;
  title?: string;
  subjectLine?: string;
  fromName?: string;
  replyTo?: string;
  totalOpens?: number;
  status?: string;
  createTime?: string;
  sendTime?: string;
}

async function handleSeedCampaign(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: SeedCampaignPayload;
  try {
    payload = JSON.parse(bodyText) as SeedCampaignPayload;
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid json" }));
    return;
  }
  if (!payload.campaignId || !payload.audienceId) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "campaignId + audienceId required" }));
    return;
  }
  state.campaigns.set(payload.campaignId, {
    id: payload.campaignId,
    status: payload.status ?? "sent",
    create_time: payload.createTime ?? new Date().toISOString(),
    send_time: payload.sendTime ?? new Date().toISOString(),
    recipients: {
      list_id: payload.audienceId,
      list_name: payload.audienceName ?? "Mock Audience",
    },
    settings: {
      title: payload.title ?? "Mock Campaign",
      subject_line: payload.subjectLine ?? "Mock Subject",
      from_name: payload.fromName ?? "Acme",
      reply_to: payload.replyTo ?? "hi@acme-e2e.test",
    },
    totalOpens: payload.totalOpens ?? 0,
    openDetails: [],
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
}

interface AdvanceOpensPayload {
  campaignId: string;
  /** New email_address to add as an opener. */
  email: string;
  /** Optional timestamp; defaults to now. */
  timestamp?: string;
}

async function handleAdvanceCampaignOpens(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: AdvanceOpensPayload;
  try {
    payload = JSON.parse(bodyText) as AdvanceOpensPayload;
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid json" }));
    return;
  }
  if (!payload.campaignId || !payload.email) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "campaignId + email required" }));
    return;
  }
  const c = state.campaigns.get(payload.campaignId);
  if (!c) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "campaign not seeded" }));
    return;
  }
  c.totalOpens += 1;
  c.openDetails.unshift({
    email_address: payload.email,
    opens_count: 1,
    opens: [{ timestamp: payload.timestamp ?? new Date().toISOString() }],
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, totalOpens: c.totalOpens }));
}

// ── helpers ────────────────────────────────────────────────────────────

interface MailchimpEventFields {
  type: string;
  audienceId: string;
  email: string;
  subscriberHash: string;
  firedAt: string;
  merges: Record<string, string>;
}

/**
 * Build the form-encoded body Mailchimp would POST for a list webhook.
 * Bracket-notation keys: `data[id]`, `data[list_id]`, `data[email]`,
 * `data[merges][FNAME]`, etc.
 */
function buildMailchimpFormBody(fields: MailchimpEventFields): string {
  const params = new URLSearchParams();
  params.set("type", fields.type);
  params.set("fired_at", fields.firedAt);
  params.set("data[id]", fields.subscriberHash);
  params.set("data[list_id]", fields.audienceId);
  params.set("data[email]", fields.email);
  params.set("data[email_type]", "html");
  for (const [k, v] of Object.entries(fields.merges)) {
    params.set(`data[merges][${k}]`, v);
  }
  return params.toString();
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseFormBody(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of text.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) {
      out[decodeURIComponent(pair)] = "";
    } else {
      const k = decodeURIComponent(pair.slice(0, eq));
      const v = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, " "));
      out[k] = v;
    }
  }
  return out;
}
