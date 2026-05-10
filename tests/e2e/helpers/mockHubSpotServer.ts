import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import { createHmac } from "node:crypto";

/**
 * Standalone mock HubSpot (OAuth + CRM v3 + webhook subscriptions v3)
 * server for the Slice 13 e2e walkthrough.
 *
 * V2's first CRM provider AND first app-level shared-subscription
 * webhook trigger with portal-scoped reference counting. The mock owns:
 *
 * Routes:
 *   GET  /oauth/authorize                         → 302 to redirect_uri
 *                                                   with state +
 *                                                   synthetic code.
 *                                                   Records absence of
 *                                                   PKCE params (HubSpot
 *                                                   Public Apps don't
 *                                                   send PKCE; the spec
 *                                                   asserts V2 didn't
 *                                                   send it).
 *   POST /oauth/v1/token                          → access_token +
 *                                                   refresh_token +
 *                                                   expires_in + scope.
 *                                                   Form-encoded body,
 *                                                   NO Basic auth.
 *                                                   Mock validates
 *                                                   client_secret IS in
 *                                                   the body AND no
 *                                                   Authorization
 *                                                   header — HubSpot
 *                                                   uses body-auth.
 *   GET  /oauth/v1/access-tokens/{token}          → returns user +
 *                                                   user_id + hub_id +
 *                                                   hub_domain. Primary
 *                                                   account-info
 *                                                   endpoint (no auth
 *                                                   header — token is
 *                                                   in the URL path).
 *   GET  /integrations/v1/me                      → fallback account
 *                                                   resolution endpoint
 *                                                   (Bearer auth).
 *   POST /crm/v3/objects/contacts                 → echoes synthetic id
 *                                                   + records the
 *                                                   Authorization
 *                                                   bearer header so
 *                                                   the spec asserts
 *                                                   V2 sent the
 *                                                   decrypted token.
 *   POST /webhooks/v3/{appId}/subscriptions       → returns synthetic
 *                                                   id. Records body
 *                                                   so spec asserts
 *                                                   eventType +
 *                                                   propertyName +
 *                                                   active=true and NO
 *                                                   targetUrl (V1
 *                                                   sends it; V2
 *                                                   omits — Public
 *                                                   Apps use a single
 *                                                   global URL from the
 *                                                   developer-portal
 *                                                   settings).
 *   DELETE /webhooks/v3/{appId}/subscriptions/{id}→ soft delete.
 *
 * Control plane (test-only):
 *   POST /__sendWebhookEvent       — signs + POSTs a HubSpot event to
 *                                    the configured webhook URL. Body:
 *                                    `{ subscriptionType, eventId?,
 *                                    portalId, objectId?, propertyName?,
 *                                    propertyValue? }`. Signature is
 *                                    HMAC-SHA256-base64 of
 *                                    `POST${webhookUrl}${rawBody}${timestamp}`
 *                                    keyed with `HUBSPOT_CLIENT_SECRET`.
 *   POST /__replayLastWebhookEvent — replay the last sent event with
 *                                    the SAME signed body + signature
 *                                    + timestamp. Tests dedup-by-event.id.
 *   POST /__sendInvalidSignaturePing — POSTs a HubSpot-shaped body
 *                                    with a deliberately wrong
 *                                    X-HubSpot-Signature-V3. V2 must 401.
 *   POST /__sendUnsupportedEvent   — sign + POST an event whose
 *                                    subscriptionType is NOT mirrored
 *                                    by a `hubspot_app_subscriptions`
 *                                    row. V2 must 200-ack without
 *                                    dispatch (logs unknown_subscription).
 *   POST /__reset                  — clear all state.
 *   GET  /__inspect                — dump calls + state.
 *
 * Listens on a fixed port (default 9883, override via HUBSPOT_MOCK_PORT).
 * Different port from Slack (9876), Google (9877), Microsoft (9878),
 * Notion (9879), Airtable (9880), Stripe (9881), Shopify (9882).
 */

export interface RecordedAuthorize {
  state: string;
  redirectUri: string | null;
  responseType: string | null;
  scope: string | null;
  clientId: string | null;
  /** PKCE absence proof — HubSpot doesn't accept these. */
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
}

export interface RecordedTokenExchange {
  authorization: string | undefined;
  contentType: string | undefined;
  body: string;
  parsedBody: Record<string, string>;
}

export interface RecordedAccessTokenInfo {
  /** The token from the URL path. */
  pathToken: string;
  /** Should be absent — HubSpot's access-tokens endpoint takes no auth. */
  authorization: string | undefined;
}

export interface RecordedIntegrationsMe {
  authorization: string | undefined;
}

export interface RecordedContactCall {
  method: string;
  authorization: string | undefined;
  contentType: string | undefined;
  url: string;
  body: string;
  parsedBody: Record<string, unknown>;
  responseContactId: string | null;
}

export interface RecordedWebhookSubscriptionCreate {
  appId: string;
  authorization: string | undefined;
  contentType: string | undefined;
  body: string;
  parsedBody: Record<string, unknown>;
  eventType: string | null;
  propertyName: string | null;
  active: boolean | null;
  /** Defense-in-depth: V1 sent this — V2 must NOT. */
  targetUrl: string | null;
  responseSubscriptionId: string;
}

export interface RecordedWebhookSubscriptionDelete {
  appId: string;
  authorization: string | undefined;
  subscriptionId: string;
}

export interface RecordedWebhookEvent {
  subscriptionType: string;
  eventId: string;
  portalId: string;
  url: string;
  status: number;
  responseBody: string;
}

export interface MockHubSpotHandle {
  port: number;
  baseUrl: string;
  calls: {
    authorize: RecordedAuthorize[];
    tokenExchange: RecordedTokenExchange[];
    accessTokenInfo: RecordedAccessTokenInfo[];
    integrationsMe: RecordedIntegrationsMe[];
    contacts: RecordedContactCall[];
    webhookSubscriptionCreate: RecordedWebhookSubscriptionCreate[];
    webhookSubscriptionDelete: RecordedWebhookSubscriptionDelete[];
    webhookEvent: RecordedWebhookEvent[];
  };
  reset(): void;
  stop(): Promise<void>;
}

const DEFAULT_PORT = Number(process.env.HUBSPOT_MOCK_PORT ?? "9883");

interface MockSubscription {
  id: string;
  appId: string;
  eventType: string;
  propertyName: string | null;
  active: boolean;
}

interface LastSentEvent {
  subscriptionType: string;
  rawBody: string;
  timestampMs: number;
  signature: string;
  eventId: string;
  portalId: string;
}

interface MutableState {
  calls: MockHubSpotHandle["calls"];
  subscriptions: Map<string, MockSubscription>;
  lastSubscriptionId: string | null;
  subscriptionCounter: number;
  contactCounter: number;
  eventCounter: number;
  lastEvent: LastSentEvent | null;
}

function freshState(): MutableState {
  return {
    calls: {
      authorize: [],
      tokenExchange: [],
      accessTokenInfo: [],
      integrationsMe: [],
      contacts: [],
      webhookSubscriptionCreate: [],
      webhookSubscriptionDelete: [],
      webhookEvent: [],
    },
    subscriptions: new Map(),
    lastSubscriptionId: null,
    subscriptionCounter: 0,
    contactCounter: 0,
    eventCounter: 0,
    lastEvent: null,
  };
}

export interface StartMockHubSpotOptions {
  /**
   * V2 dev server base URL — used as the default callback origin for
   * the OAuth authorize redirect when the caller omits redirect_uri.
   */
  appBaseUrl: string;
  /**
   * The HubSpot client secret — the mock signs webhook deliveries with
   * this so V2's `verifyHubSpotSignature` (reading
   * `HUBSPOT_CLIENT_SECRET` from the dev server env) accepts them.
   */
  appSecret: string;
  /**
   * The signing URL HubSpot's docs require — the EXACT URL configured
   * in the developer-portal app settings. V2's receive route reads
   * `HUBSPOT_WEBHOOK_URL` env to know which URL was signed; the mock
   * must POST signed events to this same URL AND include it in the
   * canonical request string. Typically `${appBaseUrl}/api/webhooks/hubspot`.
   */
  webhookUrl: string;
  port?: number;
}

export async function startMockHubSpotServer(
  opts: StartMockHubSpotOptions,
): Promise<MockHubSpotHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const state = freshState();

  const server: Server = createServer((req, res) => {
    handleRequest(req, res, opts, state).catch((err) => {
      console.error("[mock-hubspot] handler crashed", err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("mock-hubspot handler crashed");
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
  opts: StartMockHubSpotOptions,
  state: MutableState,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://placeholder");

  // ── OAuth Authorize ──
  if (req.method === "GET" && url.pathname === "/oauth/authorize") {
    return handleAuthorize(res, opts.appBaseUrl, state, url);
  }

  // ── OAuth Token Exchange ──
  if (req.method === "POST" && url.pathname === "/oauth/v1/token") {
    return handleTokenExchange(req, res, state);
  }

  // ── Account Info: /oauth/v1/access-tokens/{token} ──
  const accessTokenMatch = url.pathname.match(
    /^\/oauth\/v1\/access-tokens\/(.+)$/,
  );
  if (req.method === "GET" && accessTokenMatch) {
    return handleAccessTokenInfo(req, res, state, accessTokenMatch[1]!);
  }

  // ── Account Info Fallback: /integrations/v1/me ──
  if (req.method === "GET" && url.pathname === "/integrations/v1/me") {
    return handleIntegrationsMe(req, res, state);
  }

  // ── CRM v3: POST /crm/v3/objects/contacts ──
  if (req.method === "POST" && url.pathname === "/crm/v3/objects/contacts") {
    return handleContactsCreate(req, res, state);
  }

  // ── Webhook subscription management ──
  const subCreateMatch = url.pathname.match(
    /^\/webhooks\/v3\/([^/]+)\/subscriptions$/,
  );
  if (req.method === "POST" && subCreateMatch) {
    return handleWebhookSubscriptionCreate(
      req,
      res,
      state,
      decodeURIComponent(subCreateMatch[1]!),
    );
  }
  const subDeleteMatch = url.pathname.match(
    /^\/webhooks\/v3\/([^/]+)\/subscriptions\/([^/]+)$/,
  );
  if (req.method === "DELETE" && subDeleteMatch) {
    return handleWebhookSubscriptionDelete(
      req,
      res,
      state,
      decodeURIComponent(subDeleteMatch[1]!),
      decodeURIComponent(subDeleteMatch[2]!),
    );
  }

  // ── Control plane ─────────────────────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/__sendWebhookEvent") {
    return handleSendWebhookEvent(req, res, opts, state);
  }
  if (req.method === "POST" && url.pathname === "/__replayLastWebhookEvent") {
    return handleReplayLastWebhookEvent(res, opts, state);
  }
  if (
    req.method === "POST" &&
    url.pathname === "/__sendInvalidSignaturePing"
  ) {
    return handleSendInvalidSignaturePing(req, res, opts, state);
  }
  if (req.method === "POST" && url.pathname === "/__sendUnsupportedEvent") {
    return handleSendUnsupportedEvent(req, res, opts, state);
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
        subscriptions: Array.from(state.subscriptions.values()),
      }),
    );
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end(`mock-hubspot: unhandled ${req.method} ${url.pathname}`);
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
    scope: url.searchParams.get("scope"),
    clientId: url.searchParams.get("client_id"),
    codeChallenge: url.searchParams.get("code_challenge"),
    codeChallengeMethod: url.searchParams.get("code_challenge_method"),
  });
  const callback = url.searchParams.get("redirect_uri")
    ? new URL(url.searchParams.get("redirect_uri")!)
    : new URL("/api/integrations/oauth/hubspot/callback", appBaseUrl);
  callback.searchParams.set("code", `mock-hubspot-code-${Date.now()}`);
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

  // Body-auth: client_secret MUST be in the form body. HubSpot rejects
  // Basic auth on the token endpoint. Anti-test for V2 regressing.
  if (authHeader && authHeader.startsWith("Basic ")) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: "error",
        message:
          "HubSpot uses body-auth (client_secret in body), not Basic auth header.",
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
        status: "error",
        message: "Content-Type must be application/x-www-form-urlencoded.",
      }),
    );
    return;
  }
  if (!parsed.client_secret) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: "error",
        message: "client_secret required in body.",
      }),
    );
    return;
  }

  if (parsed.grant_type === "authorization_code") {
    if (!parsed.code) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "error",
          message: "code required for authorization_code grant.",
        }),
      );
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        access_token: "hubspot-mock-e2e-access",
        refresh_token: "hubspot-mock-e2e-refresh-1",
        token_type: "bearer",
        // ~6h, matching HubSpot's stated default.
        expires_in: 21600,
        scope:
          "crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.deals.write crm.objects.line_items.read crm.objects.line_items.write crm.objects.products.read crm.objects.products.write crm.objects.owners.read crm.lists.read crm.lists.write crm.schemas.deals.read tickets automation forms oauth",
      }),
    );
    return;
  }

  if (parsed.grant_type === "refresh_token") {
    // HubSpot refresh tokens are stable by default — mock omits a fresh
    // refresh_token to exercise V2's preserve-original path. V2's
    // Slice 11 Stripe mock uses the same pattern.
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        access_token: "hubspot-mock-e2e-access-refreshed",
        token_type: "bearer",
        expires_in: 21600,
        scope:
          "crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.deals.write crm.objects.line_items.read crm.objects.line_items.write crm.objects.products.read crm.objects.products.write crm.objects.owners.read crm.lists.read crm.lists.write crm.schemas.deals.read tickets automation forms oauth",
      }),
    );
    return;
  }

  res.writeHead(400, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      status: "error",
      message: `unsupported grant_type ${parsed.grant_type ?? "<missing>"}.`,
    }),
  );
}

async function handleAccessTokenInfo(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  pathToken: string,
): Promise<void> {
  state.calls.accessTokenInfo.push({
    pathToken: decodeURIComponent(pathToken),
    authorization: req.headers.authorization,
  });
  // HubSpot's /oauth/v1/access-tokens/{token} returns the portal info
  // associated with the token. Mock returns the e2e fixture.
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      token: decodeURIComponent(pathToken),
      user: "e2e-hubspot-user@chainreact.test",
      user_id: 7766554,
      hub_id: 9988776,
      hub_domain: "mock-hub.example.test",
      app_id: 11223344,
      token_type: "personal",
      expires_in: 21600,
      scopes: [
        "crm.objects.contacts.read",
        "crm.objects.contacts.write",
        "crm.objects.companies.read",
        "crm.objects.companies.write",
        "crm.objects.deals.read",
        "crm.objects.deals.write",
        "crm.objects.line_items.read",
        "crm.objects.line_items.write",
        "crm.objects.products.read",
        "crm.objects.products.write",
        "crm.objects.owners.read",
        "crm.lists.read",
        "crm.lists.write",
        "crm.schemas.deals.read",
        "tickets",
        "automation",
        "forms",
        "oauth",
      ],
    }),
  );
}

async function handleIntegrationsMe(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  state.calls.integrationsMe.push({
    authorization: req.headers.authorization,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      portalId: 9988776,
      userId: 7766554,
      user: "e2e-hubspot-user@chainreact.test",
      hubDomain: "mock-hub.example.test",
    }),
  );
}

// ── CRM v3 handlers ─────────────────────────────────────────────────────

async function handleContactsCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const contentType = req.headers["content-type"] as string | undefined;
  const body = await readBody(req);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = body.length > 0 ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "error", message: "invalid json" }));
    return;
  }
  state.contactCounter += 1;
  const contactId = `${100000 + state.contactCounter}`;
  state.calls.contacts.push({
    method: "POST",
    authorization: authHeader,
    contentType,
    url: req.url ?? "",
    body,
    parsedBody: parsed,
    responseContactId: contactId,
  });
  const properties = (parsed.properties ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  res.writeHead(201, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: contactId,
      properties: {
        email: properties.email ?? null,
        firstname: properties.firstname ?? null,
        lastname: properties.lastname ?? null,
        phone: properties.phone ?? null,
        company: properties.company ?? null,
      },
      createdAt: now,
      updatedAt: now,
      archived: false,
    }),
  );
}

// ── Webhook subscription handlers ──────────────────────────────────────

async function handleWebhookSubscriptionCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  appId: string,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const contentType = req.headers["content-type"] as string | undefined;
  const body = await readBody(req);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = body.length > 0 ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "error", message: "invalid json" }));
    return;
  }
  const eventType =
    typeof parsed.eventType === "string" ? parsed.eventType : null;
  const propertyName =
    typeof parsed.propertyName === "string" ? parsed.propertyName : null;
  const active = typeof parsed.active === "boolean" ? parsed.active : null;
  const targetUrl =
    typeof parsed.targetUrl === "string"
      ? (parsed.targetUrl as string)
      : null;

  state.subscriptionCounter += 1;
  const subscriptionId = `${5000 + state.subscriptionCounter}`;
  if (eventType) {
    state.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      appId,
      eventType,
      propertyName,
      active: active ?? true,
    });
    state.lastSubscriptionId = subscriptionId;
  }
  state.calls.webhookSubscriptionCreate.push({
    appId,
    authorization: authHeader,
    contentType,
    body,
    parsedBody: parsed,
    eventType,
    propertyName,
    active,
    targetUrl,
    responseSubscriptionId: subscriptionId,
  });
  const now = Date.now();
  res.writeHead(201, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: subscriptionId,
      eventType,
      propertyName: propertyName ?? undefined,
      active: active ?? true,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function handleWebhookSubscriptionDelete(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  appId: string,
  subscriptionId: string,
): Promise<void> {
  state.calls.webhookSubscriptionDelete.push({
    appId,
    authorization: req.headers.authorization,
    subscriptionId,
  });
  state.subscriptions.delete(subscriptionId);
  res.writeHead(204);
  res.end();
}

// ── Control-plane handlers ─────────────────────────────────────────────

interface SendWebhookEventPayload {
  subscriptionType?: string;
  eventId?: string | number;
  portalId?: string | number;
  objectId?: string | number;
  propertyName?: string;
  propertyValue?: unknown;
  appId?: string | number;
  occurredAt?: number;
}

async function handleSendWebhookEvent(
  req: IncomingMessage,
  res: ServerResponse,
  opts: StartMockHubSpotOptions,
  state: MutableState,
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
  if (!payload.subscriptionType) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "subscriptionType required" }));
    return;
  }
  const portalId =
    payload.portalId !== undefined ? String(payload.portalId) : "9988776";

  state.eventCounter += 1;
  const eventId =
    payload.eventId !== undefined
      ? String(payload.eventId)
      : `event-${state.eventCounter}`;
  const event = buildEvent({
    eventId,
    subscriptionType: payload.subscriptionType,
    portalId,
    objectId: payload.objectId,
    propertyName: payload.propertyName,
    propertyValue: payload.propertyValue,
    appId: payload.appId,
    occurredAt: payload.occurredAt,
  });

  const rawBody = JSON.stringify([event]);
  const timestampMs = Date.now();
  const signature = signHubSpotEvent(
    opts.appSecret,
    opts.webhookUrl,
    rawBody,
    timestampMs,
  );

  state.lastEvent = {
    subscriptionType: payload.subscriptionType,
    rawBody,
    timestampMs,
    signature,
    eventId,
    portalId,
  };

  const resp = await fetch(opts.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hubspot-signature-v3": signature,
      "x-hubspot-request-timestamp": String(timestampMs),
    },
    body: rawBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    subscriptionType: payload.subscriptionType,
    eventId,
    portalId,
    url: opts.webhookUrl,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      status: resp.status,
      body: responseBody,
      eventId,
    }),
  );
}

async function handleReplayLastWebhookEvent(
  res: ServerResponse,
  opts: StartMockHubSpotOptions,
  state: MutableState,
): Promise<void> {
  if (!state.lastEvent) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "no prior event to replay" }));
    return;
  }
  const last = state.lastEvent;
  const resp = await fetch(opts.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hubspot-signature-v3": last.signature,
      "x-hubspot-request-timestamp": String(last.timestampMs),
    },
    body: last.rawBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    subscriptionType: last.subscriptionType,
    eventId: last.eventId,
    portalId: last.portalId,
    url: opts.webhookUrl,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: resp.status, body: responseBody }));
}

interface SendInvalidSigPayload {
  subscriptionType?: string;
  portalId?: string | number;
}

async function handleSendInvalidSignaturePing(
  req: IncomingMessage,
  res: ServerResponse,
  opts: StartMockHubSpotOptions,
  state: MutableState,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: SendInvalidSigPayload;
  try {
    payload = JSON.parse(bodyText) as SendInvalidSigPayload;
  } catch {
    payload = {};
  }
  const subscriptionType = payload.subscriptionType ?? "contact.creation";
  const portalId =
    payload.portalId !== undefined ? String(payload.portalId) : "9988776";
  const event = buildEvent({
    eventId: `invalid-sig-${Date.now()}`,
    subscriptionType,
    portalId,
  });
  const rawBody = JSON.stringify([event]);
  const timestampMs = Date.now();
  // Deliberately wrong signature — 32 zero bytes base64-encoded.
  const wrongSig = Buffer.alloc(32, 0).toString("base64");
  const resp = await fetch(opts.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hubspot-signature-v3": wrongSig,
      "x-hubspot-request-timestamp": String(timestampMs),
    },
    body: rawBody,
  });
  const responseBody = await resp.text();
  // Don't push into webhookEvent — that list is for the "happy path"
  // signed deliveries the spec counts. Invalid-sig deliveries surface
  // through the response only.
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: resp.status, body: responseBody }));
  // Reference state to silence unused-arg lint.
  void state;
}

interface SendUnsupportedEventPayload {
  /**
   * A valid HubSpot event type that V2 has NOT mirrored a row for in
   * `hubspot_app_subscriptions`. The receive route 200-acks with
   * `skipReason: "unknown_subscription"`.
   */
  subscriptionType?: string;
  portalId?: string | number;
}

async function handleSendUnsupportedEvent(
  req: IncomingMessage,
  res: ServerResponse,
  opts: StartMockHubSpotOptions,
  state: MutableState,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: SendUnsupportedEventPayload;
  try {
    payload = JSON.parse(bodyText) as SendUnsupportedEventPayload;
  } catch {
    payload = {};
  }
  // Default to ticket.creation — allowlisted globally but the spec's
  // workflow only subscribes to contact.creation. The receive route
  // looks up by (appId, eventType, propertyName) → no row → 200-ack.
  const subscriptionType = payload.subscriptionType ?? "ticket.creation";
  const portalId =
    payload.portalId !== undefined ? String(payload.portalId) : "9988776";
  state.eventCounter += 1;
  const eventId = `unsupported-${state.eventCounter}`;
  const event = buildEvent({
    eventId,
    subscriptionType,
    portalId,
  });
  const rawBody = JSON.stringify([event]);
  const timestampMs = Date.now();
  const signature = signHubSpotEvent(
    opts.appSecret,
    opts.webhookUrl,
    rawBody,
    timestampMs,
  );
  const resp = await fetch(opts.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hubspot-signature-v3": signature,
      "x-hubspot-request-timestamp": String(timestampMs),
    },
    body: rawBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    subscriptionType,
    eventId,
    portalId,
    url: opts.webhookUrl,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      status: resp.status,
      body: responseBody,
      eventId,
      subscriptionType,
    }),
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

interface BuildEventInput {
  eventId: string;
  subscriptionType: string;
  portalId: string;
  objectId?: string | number;
  propertyName?: string;
  propertyValue?: unknown;
  appId?: string | number;
  occurredAt?: number;
}

function buildEvent(input: BuildEventInput): Record<string, unknown> {
  const event: Record<string, unknown> = {
    eventId: parseEventIdAsNumber(input.eventId),
    subscriptionId: 67890,
    portalId: numberOrString(input.portalId),
    appId: input.appId !== undefined ? numberOrString(input.appId) : 11223344,
    occurredAt: input.occurredAt ?? Date.now(),
    subscriptionType: input.subscriptionType,
    attemptNumber: 0,
  };
  if (input.objectId !== undefined) {
    event.objectId = numberOrString(input.objectId);
  } else {
    event.objectId = 5001;
  }
  if (input.subscriptionType.endsWith(".propertyChange")) {
    event.propertyName = input.propertyName ?? "email";
    event.propertyValue = input.propertyValue ?? "updated@example.test";
    event.changeSource = "USER";
  }
  return event;
}

/**
 * HubSpot's actual webhook events ship `eventId` as a number. Cast
 * string-numeric inputs back to numbers so the canonical event shape
 * matches what production sees. String inputs that don't round-trip as
 * pure integers (e.g. `"event-1"`) stay as strings — the dedup id is
 * stringified anyway by `normalizeHubSpotEvent`.
 */
function parseEventIdAsNumber(eventId: string): number | string {
  const parsed = Number.parseInt(eventId, 10);
  if (Number.isFinite(parsed) && String(parsed) === eventId) {
    return parsed;
  }
  return eventId;
}

function numberOrString(v: string | number): number | string {
  if (typeof v === "number") return v;
  const parsed = Number.parseInt(v, 10);
  if (Number.isFinite(parsed) && String(parsed) === v) return parsed;
  return v;
}

function signHubSpotEvent(
  secret: string,
  webhookUrl: string,
  rawBody: string,
  timestampMs: number,
): string {
  // HubSpot V3 canonical string: ${method}${requestUri}${rawBody}${timestampMs}
  // — concatenated with no separators.
  const canonical = `POST${webhookUrl}${rawBody}${timestampMs}`;
  return createHmac("sha256", secret).update(canonical, "utf8").digest("base64");
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
