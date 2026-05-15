import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import { createHmac } from "node:crypto";

/**
 * Standalone mock Shopify (per-shop OAuth + Admin REST + webhook lifecycle)
 * server for the Slice 12 e2e walkthrough.
 *
 * V2's first per-shop multi-tenant OAuth provider AND first
 * single-app-secret webhook (`X-Shopify-Hmac-SHA256` HMAC-SHA256-base64
 * over raw body, keyed with `SHOPIFY_CLIENT_SECRET`).
 *
 * URL convention: V2's Shopify code targets `https://{shop}/...` in
 * production. The dev server overrides via `SHOPIFY_API_BASE_OVERRIDE`
 * (set in `playwright.config.ts`) so all per-shop URLs become
 * `${override}/{shop}/...`. The mock parses the first path segment as
 * the shop domain and routes accordingly. Routes:
 *
 *   GET  /:shop/admin/oauth/authorize       → 302 to redirect_uri with
 *                                             state + synthetic code.
 *                                             Records absence of PKCE
 *                                             params (Shopify rejects
 *                                             PKCE; the spec asserts V2
 *                                             didn't send it).
 *   POST /:shop/admin/oauth/access_token    → access_token + scope.
 *                                             JSON body (the
 *                                             distinguishing wire-format
 *                                             feature for Shopify). Mock
 *                                             validates Content-Type +
 *                                             that body parses as JSON,
 *                                             contains client_secret.
 *                                             NO refresh_token issued.
 *   GET  /:shop/admin/api/2024-10/shop.json → name + plan_name.
 *   POST /:shop/admin/api/2024-10/customers.json → echoes synthetic id.
 *   POST /:shop/admin/api/2024-10/products/{productId}/variants.json
 *                                              → assigns synthetic variant id +
 *                                                inventory_item_id, stores
 *                                                variant state, echoes back.
 *                                                Used by create_product_variant
 *                                                (Slice 12) + as the seed step
 *                                                for the Shopify 2.1 Commit 2
 *                                                update_product_variant e2e
 *                                                chain.
 *   PUT  /:shop/admin/api/2024-10/variants/{variantId}.json
 *                                              → merges supplied fields onto
 *                                                stored variant; preserves
 *                                                inventory_item_id from create;
 *                                                returns the merged variant.
 *                                                Used by update_product_variant
 *                                                (Shopify 2.1 Commit 1).
 *   POST /:shop/admin/api/2024-10/webhooks.json  → returns synthetic id.
 *   DELETE /:shop/admin/api/2024-10/webhooks/{id}.json → soft delete.
 *
 * Control plane (test-only):
 *   POST /__sendWebhookEvent       — signs + POSTs a Shopify event to
 *                                    a created webhook subscription.
 *                                    Body: `{ webhookId, topic, body?,
 *                                    eventId? }`.
 *   POST /__replayLastWebhookEvent — replay the last sent event with
 *                                    the SAME signed body + signature.
 *                                    Tests dedup-by-X-Shopify-Webhook-Id.
 *   POST /__sendInvalidSignaturePing — POSTs a Shopify-shaped body
 *                                    with a deliberately wrong
 *                                    X-Shopify-Hmac-SHA256. V2 must 401.
 *   POST /__sendUnsupportedTopic   — sign + POST an event whose topic
 *                                    is NOT in the trigger's
 *                                    activation-time topic set.
 *                                    V2 must 200-ack without dispatch.
 *   POST /__reset                  — clear all state.
 *   GET  /__inspect                — dump calls + state.
 *
 * Listens on a fixed port (default 9882, override via SHOPIFY_MOCK_PORT).
 * Different port from Slack (9876), Google (9877), Microsoft (9878),
 * Notion (9879), Airtable (9880), Stripe (9881).
 */

export interface RecordedAuthorize {
  shop: string;
  state: string;
  redirectUri: string | null;
  responseType: string | null;
  scope: string | null;
  clientId: string | null;
  /** PKCE absence proof — Shopify doesn't accept these. */
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
}

export interface RecordedTokenExchange {
  shop: string;
  authorization: string | undefined;
  contentType: string | undefined;
  body: string;
  parsedBody: Record<string, unknown>;
}

export interface RecordedShopJson {
  shop: string;
  accessToken: string | undefined;
  authorization: string | undefined;
}

export interface RecordedCustomerCall {
  method: string;
  shop: string;
  accessToken: string | undefined;
  authorization: string | undefined;
  contentType: string | undefined;
  url: string;
  body: string;
  parsedBody: Record<string, unknown>;
  responseCustomerId: number | null;
}

export interface RecordedVariantCall {
  /** "POST" for create_product_variant; "PUT" for update_product_variant. */
  method: "POST" | "PUT";
  shop: string;
  accessToken: string | undefined;
  authorization: string | undefined;
  contentType: string | undefined;
  /** Numeric Shopify product id parsed from the path; null on PUT path. */
  productId: number | null;
  /** Numeric Shopify variant id parsed from the path; null on POST path. */
  variantId: number | null;
  url: string;
  body: string;
  parsedBody: Record<string, unknown>;
  responseVariantId: number;
  responseInventoryItemId: number;
}

export interface RecordedWebhookCreate {
  shop: string;
  accessToken: string | undefined;
  body: string;
  parsedBody: Record<string, unknown>;
  topic: string | null;
  address: string | null;
  responseWebhookId: number;
}

export interface RecordedWebhookDelete {
  shop: string;
  accessToken: string | undefined;
  webhookId: number;
}

export interface RecordedWebhookEvent {
  webhookId: number;
  shop: string;
  topic: string;
  url: string;
  webhookHeaderId: string;
  status: number;
  responseBody: string;
}

export interface MockShopifyHandle {
  port: number;
  baseUrl: string;
  calls: {
    authorize: RecordedAuthorize[];
    tokenExchange: RecordedTokenExchange[];
    shopJson: RecordedShopJson[];
    customers: RecordedCustomerCall[];
    variants: RecordedVariantCall[];
    webhookCreate: RecordedWebhookCreate[];
    webhookDelete: RecordedWebhookDelete[];
    webhookEvent: RecordedWebhookEvent[];
  };
  reset(): void;
  stop(): Promise<void>;
}

const DEFAULT_PORT = Number(process.env.SHOPIFY_MOCK_PORT ?? "9882");

interface MockWebhookSubscription {
  id: number;
  shop: string;
  topic: string;
  address: string;
}

interface LastSentEvent {
  webhookId: number;
  shop: string;
  topic: string;
  rawBody: string;
  signature: string;
  webhookHeaderId: string;
  triggeredAt: string;
}

interface MockVariantState {
  id: number;
  product_id: number;
  inventory_item_id: number;
  title?: string | null;
  price?: string | null;
  compare_at_price?: string | null;
  sku?: string | null;
  barcode?: string | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  weight?: number | null;
  weight_unit?: string | null;
  taxable?: boolean | null;
  created_at: string;
  updated_at: string;
}

interface MutableState {
  calls: MockShopifyHandle["calls"];
  webhooks: Map<number, MockWebhookSubscription>;
  lastWebhookId: number | null;
  webhookCounter: number;
  customerCounter: number;
  variantCounter: number;
  inventoryItemCounter: number;
  /** Variants by id — preserved across POST (create) + PUT (update). */
  variants: Map<number, MockVariantState>;
  eventCounter: number;
  lastEvent: LastSentEvent | null;
}

function freshState(): MutableState {
  return {
    calls: {
      authorize: [],
      tokenExchange: [],
      shopJson: [],
      customers: [],
      variants: [],
      webhookCreate: [],
      webhookDelete: [],
      webhookEvent: [],
    },
    webhooks: new Map(),
    lastWebhookId: null,
    webhookCounter: 0,
    customerCounter: 0,
    variantCounter: 0,
    inventoryItemCounter: 0,
    variants: new Map(),
    eventCounter: 0,
    lastEvent: null,
  };
}

export async function startMockShopifyServer(opts: {
  appBaseUrl: string;
  appSecret: string;
  port?: number;
}): Promise<MockShopifyHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const state = freshState();

  const server: Server = createServer((req, res) => {
    handleRequest(req, res, opts.appBaseUrl, opts.appSecret, state).catch(
      (err) => {
        console.error("[mock-shopify] handler crashed", err);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "text/plain" });
          res.end("mock-shopify handler crashed");
        }
      },
    );
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

const SHOP_PATH_REGEX = /^\/([^/]+\.myshopify\.com)\//;

function parseShopFromPath(pathname: string): {
  shop: string;
  rest: string;
} | null {
  const m = pathname.match(SHOP_PATH_REGEX);
  if (!m) return null;
  return {
    shop: decodeURIComponent(m[1]!),
    rest: pathname.slice(m[0]!.length - 1), // keep leading slash
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  appBaseUrl: string,
  appSecret: string,
  state: MutableState,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://placeholder");

  // ── Control plane (no shop in path) ──
  if (req.method === "POST" && url.pathname === "/__sendWebhookEvent") {
    return handleSendWebhookEvent(req, res, appSecret, state);
  }
  if (req.method === "POST" && url.pathname === "/__replayLastWebhookEvent") {
    return handleReplayLastWebhookEvent(res, state);
  }
  if (req.method === "POST" && url.pathname === "/__sendInvalidSignaturePing") {
    return handleSendInvalidSignaturePing(req, res, state);
  }
  if (req.method === "POST" && url.pathname === "/__sendUnsupportedTopic") {
    return handleSendUnsupportedTopic(req, res, appSecret, state);
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
      }),
    );
    return;
  }

  // ── Shop-routed requests ──
  const shopMatch = parseShopFromPath(url.pathname);
  if (!shopMatch) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end(
      `mock-shopify: unhandled ${req.method} ${url.pathname} (no shop in path)`,
    );
    return;
  }
  const { shop, rest } = shopMatch;

  // ── OAuth Authorize ──
  if (req.method === "GET" && rest === "/admin/oauth/authorize") {
    return handleAuthorize(req, res, appBaseUrl, state, shop, url);
  }

  // ── OAuth Token Exchange (JSON body) ──
  if (req.method === "POST" && rest === "/admin/oauth/access_token") {
    return handleTokenExchange(req, res, state, shop);
  }

  // ── /admin/api/2024-10/shop.json ──
  if (req.method === "GET" && rest === "/admin/api/2024-10/shop.json") {
    return handleShopJson(req, res, state, shop);
  }

  // ── /admin/api/2024-10/customers.json ──
  if (req.method === "POST" && rest === "/admin/api/2024-10/customers.json") {
    return handleCustomersCreate(req, res, state, shop);
  }

  // ── /admin/api/2024-10/products/{productId}/variants.json ──
  const variantCreateMatch = rest.match(
    /^\/admin\/api\/2024-10\/products\/(\d+)\/variants\.json$/,
  );
  if (req.method === "POST" && variantCreateMatch) {
    return handleVariantCreate(
      req,
      res,
      state,
      shop,
      Number(variantCreateMatch[1]!),
    );
  }

  // ── /admin/api/2024-10/variants/{variantId}.json ──
  const variantUpdateMatch = rest.match(
    /^\/admin\/api\/2024-10\/variants\/(\d+)\.json$/,
  );
  if (req.method === "PUT" && variantUpdateMatch) {
    return handleVariantUpdate(
      req,
      res,
      state,
      shop,
      Number(variantUpdateMatch[1]!),
    );
  }

  // ── /admin/api/2024-10/webhooks.json ──
  if (req.method === "POST" && rest === "/admin/api/2024-10/webhooks.json") {
    return handleWebhooksCreate(req, res, state, shop);
  }

  // ── /admin/api/2024-10/webhooks/{id}.json (DELETE) ──
  const deleteMatch = rest.match(/^\/admin\/api\/2024-10\/webhooks\/(\d+)\.json$/);
  if (req.method === "DELETE" && deleteMatch) {
    return handleWebhooksDelete(req, res, state, shop, Number(deleteMatch[1]!));
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end(`mock-shopify: unhandled ${req.method} /${shop}${rest}`);
}

// ── OAuth handlers ─────────────────────────────────────────────────────

async function handleAuthorize(
  _req: IncomingMessage,
  res: ServerResponse,
  appBaseUrl: string,
  state: MutableState,
  shop: string,
  url: URL,
): Promise<void> {
  const stateParam = url.searchParams.get("state");
  if (!stateParam) {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("missing state");
    return;
  }
  state.calls.authorize.push({
    shop,
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
    : new URL("/api/integrations/oauth/shopify/callback", appBaseUrl);
  callback.searchParams.set("code", `mock-shopify-code-${Date.now()}`);
  callback.searchParams.set("state", stateParam);
  callback.searchParams.set("shop", shop);
  res.writeHead(302, { location: callback.toString() });
  res.end();
}

async function handleTokenExchange(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  shop: string,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const contentType = req.headers["content-type"] as string | undefined;
  const body = await readBody(req);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = body.length > 0 ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "invalid_request",
        error_description: "body must be JSON",
      }),
    );
    return;
  }

  state.calls.tokenExchange.push({
    shop,
    authorization: authHeader,
    contentType,
    body,
    parsedBody: parsed,
  });

  // Shopify expects JSON body — NOT form-urlencoded. Reject Basic auth
  // header (anti-test for V2 accidentally regressing into Basic auth).
  if (authHeader && authHeader.startsWith("Basic ")) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "invalid_client",
        error_description:
          "Shopify uses JSON body-auth (client_secret in body), not Basic auth header.",
      }),
    );
    return;
  }
  if (!contentType?.toLowerCase().includes("application/json")) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "invalid_request",
        error_description: "Content-Type must be application/json.",
      }),
    );
    return;
  }
  if (typeof parsed.client_secret !== "string" || !parsed.client_secret) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "invalid_client",
        error_description: "client_secret required in body.",
      }),
    );
    return;
  }
  if (typeof parsed.code !== "string" || !parsed.code) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "invalid_grant",
        error_description: "code required in body.",
      }),
    );
    return;
  }

  // Shopify's token response has NO refresh_token, NO expires_in.
  // Returns access_token + scope (comma-separated, sometimes with a
  // stray space after the comma).
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      access_token: "shopify-mock-e2e-access",
      scope:
        "read_orders,write_orders,read_products,write_products,read_customers,write_customers,read_inventory,write_inventory,read_checkouts,read_fulfillments,write_fulfillments",
    }),
  );
}

async function handleShopJson(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  shop: string,
): Promise<void> {
  state.calls.shopJson.push({
    shop,
    accessToken: req.headers["x-shopify-access-token"] as string | undefined,
    authorization: req.headers.authorization,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      shop: {
        id: 12345,
        name: "Mock Shop E2E",
        plan_name: "professional",
        myshopify_domain: shop,
        domain: shop,
      },
    }),
  );
}

// ── Customer handler (action under test) ───────────────────────────────

async function handleCustomersCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  shop: string,
): Promise<void> {
  const body = await readBody(req);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = body.length > 0 ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ errors: "invalid json" }));
    return;
  }

  state.customerCounter += 1;
  const customerId = state.customerCounter * 1000 + 1;
  const customerInput = (parsed.customer ?? {}) as Record<string, unknown>;

  state.calls.customers.push({
    method: "POST",
    shop,
    accessToken: req.headers["x-shopify-access-token"] as string | undefined,
    authorization: req.headers.authorization,
    contentType: req.headers["content-type"] as string | undefined,
    url: req.url ?? "",
    body,
    parsedBody: parsed,
    responseCustomerId: customerId,
  });

  const created = new Date().toISOString();
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      customer: {
        id: customerId,
        email: customerInput.email ?? null,
        first_name: customerInput.first_name ?? null,
        last_name: customerInput.last_name ?? null,
        phone: customerInput.phone ?? null,
        tags: customerInput.tags ?? "",
        created_at: created,
        updated_at: created,
      },
    }),
  );
}

// ── Product variant handlers (create + update) ────────────────────────

async function handleVariantCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  shop: string,
  productId: number,
): Promise<void> {
  const body = await readBody(req);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = body.length > 0 ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ errors: "invalid json" }));
    return;
  }
  const variantInput = (parsed.variant ?? {}) as Record<string, unknown>;

  state.variantCounter += 1;
  state.inventoryItemCounter += 1;
  const variantId = 40000 + state.variantCounter;
  const inventoryItemId = 60000 + state.inventoryItemCounter;
  const created = new Date().toISOString();
  const variant: MockVariantState = {
    id: variantId,
    product_id: productId,
    inventory_item_id: inventoryItemId,
    title: typeof variantInput.title === "string" ? variantInput.title : null,
    price: typeof variantInput.price === "string" ? variantInput.price : null,
    compare_at_price:
      typeof variantInput.compare_at_price === "string"
        ? variantInput.compare_at_price
        : null,
    sku: typeof variantInput.sku === "string" ? variantInput.sku : null,
    barcode:
      typeof variantInput.barcode === "string" ? variantInput.barcode : null,
    option1:
      typeof variantInput.option1 === "string" ? variantInput.option1 : null,
    option2:
      typeof variantInput.option2 === "string" ? variantInput.option2 : null,
    option3:
      typeof variantInput.option3 === "string" ? variantInput.option3 : null,
    weight: typeof variantInput.weight === "number" ? variantInput.weight : null,
    weight_unit:
      typeof variantInput.weight_unit === "string"
        ? variantInput.weight_unit
        : null,
    taxable:
      typeof variantInput.taxable === "boolean" ? variantInput.taxable : null,
    created_at: created,
    updated_at: created,
  };
  state.variants.set(variantId, variant);

  state.calls.variants.push({
    method: "POST",
    shop,
    accessToken: req.headers["x-shopify-access-token"] as string | undefined,
    authorization: req.headers.authorization,
    contentType: req.headers["content-type"] as string | undefined,
    productId,
    variantId: null,
    url: req.url ?? "",
    body,
    parsedBody: parsed,
    responseVariantId: variantId,
    responseInventoryItemId: inventoryItemId,
  });

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ variant }));
}

async function handleVariantUpdate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  shop: string,
  variantId: number,
): Promise<void> {
  const body = await readBody(req);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = body.length > 0 ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ errors: "invalid json" }));
    return;
  }
  const variantInput = (parsed.variant ?? {}) as Record<string, unknown>;
  const existing = state.variants.get(variantId);
  // Helpful in e2e: synthesize a placeholder variant if the PUT lands
  // without a prior POST (lets the variant-update scenario stand alone
  // without forcing a create_product_variant call first).
  const base: MockVariantState = existing ?? {
    id: variantId,
    product_id: 0,
    inventory_item_id: 60000 + (state.inventoryItemCounter += 1),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const merged: MockVariantState = {
    ...base,
    price: typeof variantInput.price === "string" ? variantInput.price : base.price,
    compare_at_price:
      typeof variantInput.compare_at_price === "string"
        ? variantInput.compare_at_price
        : base.compare_at_price,
    sku: typeof variantInput.sku === "string" ? variantInput.sku : base.sku,
    barcode:
      typeof variantInput.barcode === "string" ? variantInput.barcode : base.barcode,
    option1:
      typeof variantInput.option1 === "string" ? variantInput.option1 : base.option1,
    option2:
      typeof variantInput.option2 === "string" ? variantInput.option2 : base.option2,
    option3:
      typeof variantInput.option3 === "string" ? variantInput.option3 : base.option3,
    weight:
      typeof variantInput.weight === "number" ? variantInput.weight : base.weight,
    weight_unit:
      typeof variantInput.weight_unit === "string"
        ? variantInput.weight_unit
        : base.weight_unit,
    taxable:
      typeof variantInput.taxable === "boolean" ? variantInput.taxable : base.taxable,
    updated_at: new Date().toISOString(),
  };
  state.variants.set(variantId, merged);

  state.calls.variants.push({
    method: "PUT",
    shop,
    accessToken: req.headers["x-shopify-access-token"] as string | undefined,
    authorization: req.headers.authorization,
    contentType: req.headers["content-type"] as string | undefined,
    productId: null,
    variantId,
    url: req.url ?? "",
    body,
    parsedBody: parsed,
    responseVariantId: variantId,
    responseInventoryItemId: merged.inventory_item_id,
  });

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ variant: merged }));
}

// ── Webhook lifecycle handlers ─────────────────────────────────────────

async function handleWebhooksCreate(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  shop: string,
): Promise<void> {
  const body = await readBody(req);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = body.length > 0 ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ errors: "invalid json" }));
    return;
  }
  const webhookInput = (parsed.webhook ?? {}) as Record<string, unknown>;
  const topic = typeof webhookInput.topic === "string" ? webhookInput.topic : null;
  const address =
    typeof webhookInput.address === "string" ? webhookInput.address : null;

  state.webhookCounter += 1;
  const webhookId = state.webhookCounter * 100 + 1;
  if (topic && address) {
    state.webhooks.set(webhookId, { id: webhookId, shop, topic, address });
    state.lastWebhookId = webhookId;
  }

  state.calls.webhookCreate.push({
    shop,
    accessToken: req.headers["x-shopify-access-token"] as string | undefined,
    body,
    parsedBody: parsed,
    topic,
    address,
    responseWebhookId: webhookId,
  });

  const created = new Date().toISOString();
  res.writeHead(201, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      webhook: {
        id: webhookId,
        topic,
        address,
        format: "json",
        api_version: "2024-10",
        created_at: created,
        updated_at: created,
      },
    }),
  );
}

async function handleWebhooksDelete(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
  shop: string,
  webhookId: number,
): Promise<void> {
  state.calls.webhookDelete.push({
    shop,
    accessToken: req.headers["x-shopify-access-token"] as string | undefined,
    webhookId,
  });
  state.webhooks.delete(webhookId);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({}));
}

// ── Control-plane handlers ─────────────────────────────────────────────

interface SendWebhookPayload {
  webhookId?: number;
  topic?: string;
  body?: Record<string, unknown>;
  eventId?: string;
}

async function handleSendWebhookEvent(
  req: IncomingMessage,
  res: ServerResponse,
  appSecret: string,
  state: MutableState,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: SendWebhookPayload;
  try {
    payload = JSON.parse(bodyText) as SendWebhookPayload;
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid json" }));
    return;
  }
  const webhookId = payload.webhookId ?? state.lastWebhookId ?? 0;
  const sub = state.webhooks.get(webhookId);
  if (!sub) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "webhook not found", webhookId }));
    return;
  }
  if (!payload.topic) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "topic required" }));
    return;
  }

  state.eventCounter += 1;
  const eventBody = JSON.stringify(payload.body ?? defaultBodyForTopic(payload.topic));
  const signature = createHmac("sha256", appSecret)
    .update(eventBody, "utf8")
    .digest("base64");
  const webhookHeaderId =
    payload.eventId ?? `mock-shopify-event-${state.eventCounter}`;
  const triggeredAt = new Date().toISOString();

  state.lastEvent = {
    webhookId,
    shop: sub.shop,
    topic: payload.topic,
    rawBody: eventBody,
    signature,
    webhookHeaderId,
    triggeredAt,
  };

  const resp = await fetch(sub.address, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": signature,
      "x-shopify-topic": payload.topic,
      "x-shopify-shop-domain": sub.shop,
      "x-shopify-webhook-id": webhookHeaderId,
      "x-shopify-triggered-at": triggeredAt,
      "x-shopify-api-version": "2024-10",
    },
    body: eventBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    webhookId,
    shop: sub.shop,
    topic: payload.topic,
    url: sub.address,
    webhookHeaderId,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      status: resp.status,
      body: responseBody,
      eventId: webhookHeaderId,
    }),
  );
}

async function handleReplayLastWebhookEvent(
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  if (!state.lastEvent) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "no prior event to replay" }));
    return;
  }
  const sub = state.webhooks.get(state.lastEvent.webhookId);
  if (!sub) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "webhook gone" }));
    return;
  }
  const last = state.lastEvent;
  const resp = await fetch(sub.address, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": last.signature,
      "x-shopify-topic": last.topic,
      "x-shopify-shop-domain": last.shop,
      "x-shopify-webhook-id": last.webhookHeaderId,
      "x-shopify-triggered-at": last.triggeredAt,
      "x-shopify-api-version": "2024-10",
    },
    body: last.rawBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    webhookId: last.webhookId,
    shop: last.shop,
    topic: last.topic,
    url: sub.address,
    webhookHeaderId: last.webhookHeaderId,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: resp.status, body: responseBody }));
}

interface SendInvalidSigPayload {
  webhookId?: number;
  topic?: string;
}

async function handleSendInvalidSignaturePing(
  req: IncomingMessage,
  res: ServerResponse,
  state: MutableState,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: SendInvalidSigPayload;
  try {
    payload = JSON.parse(bodyText) as SendInvalidSigPayload;
  } catch {
    payload = {};
  }
  const webhookId = payload.webhookId ?? state.lastWebhookId ?? 0;
  const sub = state.webhooks.get(webhookId);
  if (!sub) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "webhook not found" }));
    return;
  }
  const eventBody = JSON.stringify({ id: 999, mock: "invalid-sig" });
  // Deliberately wrong signature — base64 of 32 zero bytes.
  const wrongSig = Buffer.alloc(32, 0).toString("base64");
  const resp = await fetch(sub.address, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": wrongSig,
      "x-shopify-topic": payload.topic ?? sub.topic,
      "x-shopify-shop-domain": sub.shop,
      "x-shopify-webhook-id": `invalid-sig-${Date.now()}`,
      "x-shopify-triggered-at": new Date().toISOString(),
    },
    body: eventBody,
  });
  const responseBody = await resp.text();
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: resp.status, body: responseBody }));
}

interface SendUnsupportedTopicPayload {
  webhookId?: number;
  topic?: string;
}

async function handleSendUnsupportedTopic(
  req: IncomingMessage,
  res: ServerResponse,
  appSecret: string,
  state: MutableState,
): Promise<void> {
  const bodyText = await readBody(req);
  let payload: SendUnsupportedTopicPayload;
  try {
    payload = JSON.parse(bodyText) as SendUnsupportedTopicPayload;
  } catch {
    payload = {};
  }
  const webhookId = payload.webhookId ?? state.lastWebhookId ?? 0;
  const sub = state.webhooks.get(webhookId);
  if (!sub) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "webhook not found" }));
    return;
  }
  // Use a topic that V2 accepts globally (allowlisted) but is NOT in
  // the trigger's activation-time topic set. Default: customers/create
  // (guaranteed allowlisted; the spec subscribes only to orders/*).
  const topic = payload.topic ?? "customers/create";
  state.eventCounter += 1;
  const webhookHeaderId = `unsupported-topic-${state.eventCounter}`;
  const eventBody = JSON.stringify({ id: 555, mock: "unsupported" });
  const signature = createHmac("sha256", appSecret)
    .update(eventBody, "utf8")
    .digest("base64");
  const triggeredAt = new Date().toISOString();
  const resp = await fetch(sub.address, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": signature,
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": sub.shop,
      "x-shopify-webhook-id": webhookHeaderId,
      "x-shopify-triggered-at": triggeredAt,
    },
    body: eventBody,
  });
  const responseBody = await resp.text();
  state.calls.webhookEvent.push({
    webhookId,
    shop: sub.shop,
    topic,
    url: sub.address,
    webhookHeaderId,
    status: resp.status,
    responseBody,
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({ status: resp.status, body: responseBody, topic }),
  );
}

// ── helpers ────────────────────────────────────────────────────────────

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function defaultBodyForTopic(topic: string): Record<string, unknown> {
  // Minimal-but-realistic Shopify resource snapshots, keyed by topic.
  // The receive route doesn't validate body shape past JSON.parse — these
  // are just enough to round-trip a TriggerEvent normalize call.
  if (topic.startsWith("orders/")) {
    return {
      id: 1001,
      email: "buyer@e2e.test",
      total_price: "20.99",
      currency: "USD",
      financial_status: "paid",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  if (topic.startsWith("customers/")) {
    return {
      id: 2001,
      email: "customer@e2e.test",
      first_name: "Alice",
      created_at: new Date().toISOString(),
    };
  }
  if (topic.startsWith("products/")) {
    return {
      id: 3001,
      title: "Mock Product",
      created_at: new Date().toISOString(),
    };
  }
  if (topic.startsWith("checkouts/")) {
    return {
      id: 4001,
      token: "mock-checkout-token",
      created_at: new Date().toISOString(),
    };
  }
  if (topic.startsWith("inventory_levels/")) {
    return {
      inventory_item_id: 5001,
      location_id: 9001,
      available: 7,
      updated_at: new Date().toISOString(),
    };
  }
  return {
    id: 9999,
    created_at: new Date().toISOString(),
  };
}
