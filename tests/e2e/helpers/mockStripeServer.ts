import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import { createHmac } from "node:crypto";

/**
 * Standalone mock Stripe (Connect OAuth + REST + webhook endpoints) server
 * for the Slice 11 e2e walkthrough.
 *
 * V2's first body-auth refreshable provider AND first
 * `Stripe-Signature: t=,v1=` HMAC-over-`${t}.${rawBody}` webhook.
 * The mock owns:
 *
 * Routes:
 *   GET  /oauth/authorize       → 302 to redirect_uri with state +
 *                                 synthetic code. Records absence of
 *                                 PKCE params (Stripe Connect rejects
 *                                 PKCE; the spec asserts V2 didn't send
 *                                 it).
 *   POST /oauth/token           → access_token + refresh_token +
 *                                 stripe_user_id + scope + livemode.
 *                                 Form-encoded body, NO Basic auth.
 *                                 Mock validates client_secret IS in the
 *                                 body AND no Authorization header — V2
 *                                 sends body-auth.
 *   POST /v1/customers          → echoes back synthetic id + records
 *                                 the Idempotency-Key header so the
 *                                 spec asserts V2 sent it on
 *                                 create_customer.
 *   POST /v1/webhook_endpoints  → returns synthetic id + signing
 *                                 secret. Mock holds the secret in
 *                                 string form so __sendWebhookEvent
 *                                 can sign payloads correctly.
 *   DELETE /v1/webhook_endpoints/{id} → soft delete.
 *
 * Control plane (test-only):
 *   POST /__sendWebhookEvent       — signs + POSTs a Stripe event to
 *                                    the most recently created webhook
 *                                    endpoint. Body: `{ eventType,
 *                                    eventId?, data?, endpointId? }`.
 *   POST /__replayLastWebhookEvent — replay the last sent event with
 *                                    the SAME signed body + signature.
 *                                    Tests dedup-by-event.id.
 *   POST /__sendInvalidSignaturePing — POSTs a Stripe-shaped body
 *                                    with a deliberately wrong v1=
 *                                    signature. V2 must 401.
 *   POST /__sendUnsupportedEvent   — sign + POST an event whose `type`
 *                                    is outside the Slice 11 allowlist.
 *                                    V2 must 200-ack without dispatch.
 *   POST /__reset                  — clear all state.
 *   GET  /__inspect                — dump calls + state.
 *
 * Listens on a fixed port (default 9881, override via STRIPE_MOCK_PORT).
 * Different port from Slack (9876), Google (9877), Microsoft (9878),
 * Notion (9879), Airtable (9880).
 */

export interface RecordedAuthorize {
  state: string;
  redirectUri: string | null;
  responseType: string | null;
  scope: string | null;
  clientId: string | null;
  /** PKCE absence proof — Stripe Connect doesn't accept these. */
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
}

export interface RecordedTokenExchange {
  authorization: string | undefined;
  contentType: string | undefined;
  body: string;
  parsedBody: Record<string, string>;
}

export interface RecordedCustomerCall {
  method: string;
  authorization: string | undefined;
  idempotencyKey: string | undefined;
  stripeVersion: string | undefined;
  contentType: string | undefined;
  url: string;
  body: string;
  parsedBody: Record<string, string>;
  responseCustomerId: string | null;
}

export interface RecordedWebhookEndpointCreate {
  authorization: string | undefined;
  body: string;
  parsedBody: Record<string, string>;
  responseEndpointId: string;
}

export interface RecordedWebhookEndpointDelete {
  authorization: string | undefined;
  endpointId: string;
}

export interface RecordedWebhookEvent {
  endpointId: string;
  url: string;
  eventId: string;
  eventType: string;
  status: number;
  responseBody: string;
}

export interface MockStripeHandle {
  port: number;
  baseUrl: string;
  calls: {
    authorize: RecordedAuthorize[];
    tokenExchange: RecordedTokenExchange[];
    customers: RecordedCustomerCall[];
    webhookEndpointCreate: RecordedWebhookEndpointCreate[];
    webhookEndpointDelete: RecordedWebhookEndpointDelete[];
    webhookEvent: RecordedWebhookEvent[];
  };
  reset(): void;
  stop(): Promise<void>;
}

const DEFAULT_PORT = Number(process.env.STRIPE_MOCK_PORT ?? "9881");

interface MockWebhookEndpoint {
  id: string;
  secret: string;
  url: string;
  enabled_events: string[];
  description: string | null;
  api_version: string | null;
}

interface LastSentEvent {
  endpointId: string;
  rawBody: string;
  timestamp: number;
  signature: string;
  eventId: string;
  eventType: string;
}

interface MutableState {
  calls: MockStripeHandle["calls"];
  endpoints: Map<string, MockWebhookEndpoint>;
  lastEndpointId: string | null;
  endpointCounter: number;
  customerCounter: number;
  eventCounter: number;
  lastEvent: LastSentEvent | null;
}

function freshState(): MutableState {
  return {
    calls: {
      authorize: [],
      tokenExchange: [],
      customers: [],
      webhookEndpointCreate: [],
      webhookEndpointDelete: [],
      webhookEvent: [],
    },
    endpoints: new Map(),
    lastEndpointId: null,
    endpointCounter: 0,
    customerCounter: 0,
    eventCounter: 0,
    lastEvent: null,
  };
}

export async function startMockStripeServer(opts: {
  appBaseUrl: string;
  port?: number;
}): Promise<MockStripeHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const state = freshState();

  const server: Server = createServer((req, res) => {
    handleRequest(req, res, opts.appBaseUrl, state).catch((err) => {
      console.error("[mock-stripe] handler crashed", err);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("mock-stripe handler crashed");
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
  appBaseUrl: string,
  state: MutableState,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://placeholder");

  // ── OAuth Authorize ──
  if (req.method === "GET" && url.pathname === "/oauth/authorize") {
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
      : new URL("/api/integrations/oauth/stripe/callback", appBaseUrl);
    callback.searchParams.set("code", `mock-stripe-code-${Date.now()}`);
    callback.searchParams.set("state", stateParam);
    res.writeHead(302, { location: callback.toString() });
    res.end();
    return;
  }

  // ── OAuth Token (auth_code + refresh_token branches) ──
  if (req.method === "POST" && url.pathname === "/oauth/token") {
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

    // Body-auth: client_secret MUST be in the form body. If V2
    // accidentally switches to Basic auth, the mock catches it here
    // (V1 / current Stripe Connect docs both use body-auth).
    if (authHeader && authHeader.startsWith("Basic ")) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "invalid_client",
          error_description:
            "Stripe Connect uses body-auth (client_secret in body), not Basic auth header.",
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

    if (parsed.grant_type === "authorization_code") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          access_token: "stripe-mock-e2e-access",
          refresh_token: "stripe-mock-e2e-refresh-1",
          token_type: "bearer",
          scope: "read_write",
          livemode: false,
          stripe_user_id: "acct_TEST_E2E",
          stripe_publishable_key: "pk_test_mock_publishable",
        }),
      );
      return;
    }

    if (parsed.grant_type === "refresh_token") {
      // Stripe Connect refresh tokens are NOT rotated by default —
      // V2's refreshToken() preserves the original when the response
      // omits refresh_token. Mock returns a new access_token but
      // omits refresh_token to exercise the preserve-original path.
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          access_token: "stripe-mock-e2e-access-refreshed",
          token_type: "bearer",
          scope: "read_write",
          livemode: false,
          stripe_user_id: "acct_TEST_E2E",
        }),
      );
      return;
    }

    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "unsupported_grant_type",
        error_description: `unknown grant_type ${parsed.grant_type ?? "<missing>"}.`,
      }),
    );
    return;
  }

  // ── /v1/customers (POST + GET) ──
  if (url.pathname === "/v1/customers" && req.method === "POST") {
    const authHeader = req.headers.authorization;
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
    const stripeVersion = req.headers["stripe-version"] as string | undefined;
    const contentType = req.headers["content-type"] as string | undefined;
    const body = await readBody(req);
    const parsed = parseFormBody(body);
    state.customerCounter += 1;
    const customerId = `cus_mock_${state.customerCounter}`;
    const created = Math.floor(Date.now() / 1000);
    const responseBody = {
      id: customerId,
      object: "customer",
      email: parsed.email ?? null,
      name: parsed.name ?? null,
      phone: null,
      description: parsed.description ?? null,
      created,
      currency: null,
      balance: 0,
      delinquent: false,
      address: null,
      shipping: null,
      tax_exempt: "none",
      metadata: extractMetadata(parsed),
      livemode: false,
    };
    state.calls.customers.push({
      method: "POST",
      authorization: authHeader,
      idempotencyKey,
      stripeVersion,
      contentType,
      url: req.url ?? "",
      body,
      parsedBody: parsed,
      responseCustomerId: customerId,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(responseBody));
    return;
  }

  // ── /v1/webhook_endpoints ──
  if (url.pathname === "/v1/webhook_endpoints" && req.method === "POST") {
    const authHeader = req.headers.authorization;
    const body = await readBody(req);
    const parsed = parseFormBody(body);
    state.endpointCounter += 1;
    const endpointId = `we_mock_${state.endpointCounter}`;
    const secret = `whsec_mock_${endpointId}_signing_secret`;
    const enabledEvents = collectIndexedArray(parsed, "enabled_events");
    const endpoint: MockWebhookEndpoint = {
      id: endpointId,
      secret,
      url: parsed.url ?? "",
      enabled_events: enabledEvents,
      description: parsed.description ?? null,
      api_version: parsed.api_version ?? null,
    };
    state.endpoints.set(endpointId, endpoint);
    state.lastEndpointId = endpointId;
    state.calls.webhookEndpointCreate.push({
      authorization: authHeader,
      body,
      parsedBody: parsed,
      responseEndpointId: endpointId,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: endpointId,
        object: "webhook_endpoint",
        url: endpoint.url,
        secret,
        enabled_events: enabledEvents,
        status: "enabled",
        livemode: false,
        created: Math.floor(Date.now() / 1000),
        api_version: endpoint.api_version,
        description: endpoint.description,
      }),
    );
    return;
  }

  const webhookEndpointDeleteMatch = url.pathname.match(
    /^\/v1\/webhook_endpoints\/([^/]+)$/,
  );
  if (req.method === "DELETE" && webhookEndpointDeleteMatch) {
    const endpointId = decodeURIComponent(webhookEndpointDeleteMatch[1]!);
    state.calls.webhookEndpointDelete.push({
      authorization: req.headers.authorization,
      endpointId,
    });
    state.endpoints.delete(endpointId);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: endpointId,
        object: "webhook_endpoint",
        deleted: true,
      }),
    );
    return;
  }

  // ── Control plane ─────────────────────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/__sendWebhookEvent") {
    const bodyText = await readBody(req);
    let payload: {
      endpointId?: string;
      eventType?: string;
      eventId?: string;
      data?: Record<string, unknown>;
      account?: string | null;
    };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    const endpointId = payload.endpointId ?? state.lastEndpointId ?? "";
    const endpoint = state.endpoints.get(endpointId);
    if (!endpoint) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "endpoint not found", endpointId }));
      return;
    }
    if (!payload.eventType) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "eventType required" }));
      return;
    }
    state.eventCounter += 1;
    const eventId = payload.eventId ?? `evt_mock_${state.eventCounter}`;
    const eventBody = JSON.stringify({
      id: eventId,
      object: "event",
      type: payload.eventType,
      api_version: "2025-05-28.basil",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      account: payload.account ?? "acct_TEST_E2E",
      data: { object: payload.data ?? {} },
      request: { id: null, idempotency_key: null },
      pending_webhooks: 1,
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", endpoint.secret)
      .update(`${timestamp}.${eventBody}`, "utf8")
      .digest("hex");
    const signatureHeader = `t=${timestamp},v1=${signature}`;
    state.lastEvent = {
      endpointId,
      rawBody: eventBody,
      timestamp,
      signature: signatureHeader,
      eventId,
      eventType: payload.eventType,
    };
    const resp = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signatureHeader,
      },
      body: eventBody,
    });
    const responseBody = await resp.text();
    state.calls.webhookEvent.push({
      endpointId,
      url: endpoint.url,
      eventId,
      eventType: payload.eventType,
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
    return;
  }

  if (req.method === "POST" && url.pathname === "/__replayLastWebhookEvent") {
    if (!state.lastEvent) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "no prior event to replay" }));
      return;
    }
    const endpoint = state.endpoints.get(state.lastEvent.endpointId);
    if (!endpoint) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "endpoint gone" }));
      return;
    }
    const resp = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": state.lastEvent.signature,
      },
      body: state.lastEvent.rawBody,
    });
    const responseBody = await resp.text();
    state.calls.webhookEvent.push({
      endpointId: state.lastEvent.endpointId,
      url: endpoint.url,
      eventId: state.lastEvent.eventId,
      eventType: state.lastEvent.eventType,
      status: resp.status,
      responseBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ status: resp.status, body: responseBody }),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/__sendInvalidSignaturePing") {
    const bodyText = await readBody(req);
    let payload: { endpointId?: string };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = {};
    }
    const endpointId = payload.endpointId ?? state.lastEndpointId ?? "";
    const endpoint = state.endpoints.get(endpointId);
    if (!endpoint) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "endpoint not found" }));
      return;
    }
    const eventBody = JSON.stringify({
      id: `evt_mock_invalid_${Date.now()}`,
      object: "event",
      type: "payment_intent.succeeded",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object: {} },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    // Deliberately wrong signature.
    const wrongSig = "f".repeat(64);
    const resp = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${wrongSig}`,
      },
      body: eventBody,
    });
    const responseBody = await resp.text();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: resp.status, body: responseBody }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/__sendUnsupportedEvent") {
    const bodyText = await readBody(req);
    let payload: { endpointId?: string; eventType?: string };
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = {};
    }
    const endpointId = payload.endpointId ?? state.lastEndpointId ?? "";
    const endpoint = state.endpoints.get(endpointId);
    if (!endpoint) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "endpoint not found" }));
      return;
    }
    const eventType = payload.eventType ?? "invoice.created"; // valid Stripe type, NOT in Slice 11 allowlist
    state.eventCounter += 1;
    const eventId = `evt_mock_unsupported_${state.eventCounter}`;
    const eventBody = JSON.stringify({
      id: eventId,
      object: "event",
      type: eventType,
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object: {} },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", endpoint.secret)
      .update(`${timestamp}.${eventBody}`, "utf8")
      .digest("hex");
    const resp = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${signature}`,
      },
      body: eventBody,
    });
    const responseBody = await resp.text();
    state.calls.webhookEvent.push({
      endpointId,
      url: endpoint.url,
      eventId,
      eventType,
      status: resp.status,
      responseBody,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ status: resp.status, body: responseBody, eventId }),
    );
    return;
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
        endpoints: Array.from(state.endpoints.values()).map((e) => ({
          id: e.id,
          secret: e.secret,
          url: e.url,
          enabled_events: e.enabled_events,
        })),
      }),
    );
    return;
  }

  // 404 for anything else.
  res.writeHead(404, { "content-type": "text/plain" });
  res.end(`mock-stripe: unhandled ${req.method} ${url.pathname}`);
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

/**
 * Pull `field[0]`, `field[1]`, ... values from a parsed form body in
 * order. Stripe-style array shape — used to assemble enabled_events
 * back into a list for assertions.
 */
function collectIndexedArray(
  parsed: Record<string, string>,
  prefix: string,
): string[] {
  const out: string[] = [];
  for (let i = 0; ; i += 1) {
    const key = `${prefix}[${i}]`;
    if (!(key in parsed)) break;
    out.push(parsed[key]!);
  }
  return out;
}

/**
 * Pull `metadata[key]` entries out of a parsed form body and return
 * the typed metadata map.
 */
function extractMetadata(
  parsed: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    const m = k.match(/^metadata\[([^\]]+)\]$/);
    if (m) out[m[1]!] = v;
  }
  return out;
}
