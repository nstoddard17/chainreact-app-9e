/**
 * @jest-environment node
 *
 * shopify/triggers/webhookReceived trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockCreate = jest.fn();
const mockDelete = jest.fn();
const mockDecrypt = jest.fn();
const mockFindByWorkflowAndNode = jest.fn();

jest.mock("@/integrations/_shared/shopify/api/webhooks", () => ({
  webhooksCreate: (...args: unknown[]) => mockCreate(...args),
  webhooksDelete: (...args: unknown[]) => mockDelete(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (v: string) => mockDecrypt(v),
}));

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...args: unknown[]) =>
    mockFindByWorkflowAndNode(...args),
}));

import { activate } from "@/integrations/shopify/triggers/webhookReceived/activate";
import { isAllowedShopifyTopic, SHOPIFY_ALLOWED_TOPICS } from "@/integrations/shopify/triggers/webhookReceived/allowedTopics";
import { NotFoundError } from "@/integrations/_shared/shopify/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { deactivate } from "@/integrations/shopify/triggers/webhookReceived/deactivate";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import "@/integrations/_registry";
import { normalizeShopifyEvent } from "@/integrations/shopify/triggers/webhookReceived/normalize";
import { createHmac } from "node:crypto";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveShopifyWebhook } from "@/integrations/shopify/triggers/webhookReceived/receive";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

beforeEach(() => {
  mockCreate.mockReset();
  mockDelete.mockReset();
  mockDecrypt.mockReset();
  mockDecrypt.mockImplementation((v: string) => `decrypted-${v}`);
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.SHOPIFY_WEBHOOK_URL;
});

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "shopify",
  providerAccountId: "merchant.myshopify.com",
  displayName: "merchant.myshopify.com",
  accessTokenEncrypted: "ENC-MERCHANT",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["read_orders", "write_orders"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "shopify",
  type: "webhook_received",
  config: {
    topics: ["orders/create", "customers/create"],
  },
  position: { x: 0, y: 0 },
};

describe("Shopify webhook_received activate — happy path", () => {
  it("creates ONE webhook subscription per topic and persists subscriptions to config", async () => {
    mockCreate
      .mockResolvedValueOnce({ id: 111, topic: "orders/create" })
      .mockResolvedValueOnce({ id: 222, topic: "customers/create" });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      webhookEnabled: true,
      shopDomain: "merchant.myshopify.com",
      topics: ["orders/create", "customers/create"],
      subscriptions: [
        { topic: "orders/create", webhookId: 111 },
        { topic: "customers/create", webhookId: 222 },
      ],
      notificationUrl: expect.stringContaining("/api/webhooks/shopify?"),
    });
    // Permanent endpoint pattern — NO subscription-watch marker.
    expect(result).not.toHaveProperty("type");
  });

  it("threads workflowId + nodeId into the notification URL", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, topic: "orders/create" });
    await activate({
      node: { ...baseNode, config: { topics: ["orders/create"] } },
      integration: baseIntegration,
      workflowId: "wf-XYZ",
    });
    const callArg = mockCreate.mock.calls[0]![0];
    expect(callArg.address).toContain("workflowId=wf-XYZ");
    expect(callArg.address).toContain("nodeId=node-trigger-1");
  });

  it("uses the merchant's decrypted access token (NOT a platform secret)", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, topic: "orders/create" });
    await activate({
      node: { ...baseNode, config: { topics: ["orders/create"] } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(mockDecrypt).toHaveBeenCalledWith("ENC-MERCHANT");
    expect(mockCreate.mock.calls[0]![0].accessToken).toBe(
      "decrypted-ENC-MERCHANT",
    );
  });

  it("uses the integration's providerAccountId as the shop domain", async () => {
    mockCreate.mockResolvedValueOnce({ id: 1, topic: "orders/create" });
    await activate({
      node: { ...baseNode, config: { topics: ["orders/create"] } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(mockCreate.mock.calls[0]![0].shopDomain).toBe(
      "merchant.myshopify.com",
    );
  });

  it("respects SHOPIFY_WEBHOOK_URL override (e2e mock surface)", async () => {
    process.env.SHOPIFY_WEBHOOK_URL = "http://localhost:9882";
    mockCreate.mockResolvedValueOnce({ id: 1, topic: "orders/create" });
    const result = await activate({
      node: { ...baseNode, config: { topics: ["orders/create"] } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(result.notificationUrl).toMatch(
      /^http:\/\/localhost:9882\/api\/webhooks\/shopify\?/,
    );
  });
});

describe("Shopify webhook_received activate — schema rejections", () => {
  it("rejects when topics is missing", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: {} },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/topics is required/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects when topics is empty array", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { topics: [] } },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/topics is required/);
  });

  it("rejects topics outside the Slice 12 Batch 1 allowlist (fail-loud at design time)", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { topics: ["orders/create", "orders/cancelled"] },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/orders\/cancelled.*allowlist/);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("Shopify webhook_received activate — best-effort rollback on partial failure", () => {
  it("rolls back the 2 successful subscriptions when topic #3 fails", async () => {
    mockCreate
      .mockResolvedValueOnce({ id: 111, topic: "orders/create" })
      .mockResolvedValueOnce({ id: 222, topic: "customers/create" })
      .mockRejectedValueOnce(new Error("Shopify 422: invalid"));
    mockDelete.mockResolvedValue(undefined);

    await expect(
      activate({
        node: {
          ...baseNode,
          config: {
            topics: [
              "orders/create",
              "customers/create",
              "products/update",
            ],
          },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/Shopify 422/);

    // Both successful subscriptions deleted.
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockDelete.mock.calls[0]![0].webhookId).toBe(111);
    expect(mockDelete.mock.calls[1]![0].webhookId).toBe(222);
  });

  it("swallows rollback errors and still re-throws the original failure", async () => {
    mockCreate
      .mockResolvedValueOnce({ id: 111, topic: "orders/create" })
      .mockRejectedValueOnce(new Error("primary failure"));
    mockDelete.mockRejectedValueOnce(new Error("rollback failed"));

    await expect(
      activate({
        node: {
          ...baseNode,
          config: { topics: ["orders/create", "customers/create"] },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/primary failure/);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former allowedTopics.test.ts
// ---------------------------------------------------------------------------
describe("allowedTopics (lifecycle)", () => {

describe("Shopify allowed topics (Slice 12 Batch 1)", () => {
  it("ships exactly 8 topics (mirrors V1's 8 trigger node types)", () => {
    expect(SHOPIFY_ALLOWED_TOPICS).toHaveLength(8);
  });

  it("includes the 8 user-approved topics", () => {
    expect(SHOPIFY_ALLOWED_TOPICS).toEqual([
      "orders/create",
      "orders/paid",
      "orders/fulfilled",
      "orders/updated",
      "customers/create",
      "products/update",
      "checkouts/create",
      "inventory_levels/update",
    ]);
  });

  it("isAllowedShopifyTopic returns true for each allowlisted topic", () => {
    for (const topic of SHOPIFY_ALLOWED_TOPICS) {
      expect(isAllowedShopifyTopic(topic)).toBe(true);
    }
  });

  it("isAllowedShopifyTopic returns false for V1 topics deferred from Batch 1", () => {
    // Examples of common Shopify topics NOT in Slice 12 Batch 1.
    expect(isAllowedShopifyTopic("orders/cancelled")).toBe(false);
    expect(isAllowedShopifyTopic("customers/update")).toBe(false);
    expect(isAllowedShopifyTopic("app/uninstalled")).toBe(false);
    expect(isAllowedShopifyTopic("draft_orders/create")).toBe(false);
  });

  it("isAllowedShopifyTopic returns false for malformed values", () => {
    expect(isAllowedShopifyTopic("")).toBe(false);
    expect(isAllowedShopifyTopic("orders/CREATE")).toBe(false);
    expect(isAllowedShopifyTopic("orders create")).toBe(false);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

// We reuse the shared module's NotFoundError class for the swallow check.
beforeEach(() => {
  mockDelete.mockReset();
  mockDecrypt.mockReset();
  mockDecrypt.mockImplementation((v: string) => `decrypted-${v}`);
});

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "shopify",
  providerAccountId: "merchant.myshopify.com",
  displayName: "merchant.myshopify.com",
  accessTokenEncrypted: "ENC-MERCHANT",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

function trigger(
  subscriptions: Array<{ topic: string; webhookId: number }> | undefined,
  shopDomain: string | undefined = "merchant.myshopify.com",
) {
  const config: Record<string, unknown> = {};
  if (subscriptions !== undefined) config.subscriptions = subscriptions;
  if (shopDomain !== undefined) config.shopDomain = shopDomain;
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "shopify",
    eventType: "webhook_received",
    nodeId: "node-1",
    config,
    providerAccountId: "merchant.myshopify.com",
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("Shopify webhook_received deactivate — happy path", () => {
  it("deletes each stored webhook subscription", async () => {
    mockDelete.mockResolvedValue(undefined);
    await deactivate({
      trigger: trigger([
        { topic: "orders/create", webhookId: 111 },
        { topic: "customers/create", webhookId: 222 },
      ]),
      integration: baseIntegration,
    });
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockDelete.mock.calls[0]![0].webhookId).toBe(111);
    expect(mockDelete.mock.calls[1]![0].webhookId).toBe(222);
  });

  it("uses the integration's providerAccountId as shopDomain (canonical source)", async () => {
    mockDelete.mockResolvedValue(undefined);
    await deactivate({
      trigger: trigger([{ topic: "orders/create", webhookId: 1 }]),
      integration: baseIntegration,
    });
    expect(mockDelete.mock.calls[0]![0].shopDomain).toBe(
      "merchant.myshopify.com",
    );
  });

  it("uses the merchant's decrypted access token", async () => {
    mockDelete.mockResolvedValue(undefined);
    await deactivate({
      trigger: trigger([{ topic: "orders/create", webhookId: 1 }]),
      integration: baseIntegration,
    });
    expect(mockDelete.mock.calls[0]![0].accessToken).toBe(
      "decrypted-ENC-MERCHANT",
    );
  });
});

describe("Shopify webhook_received deactivate — best-effort safety", () => {
  it("swallows NotFoundError per webhook (server-side already deleted)", async () => {
    mockDelete
      .mockRejectedValueOnce(new NotFoundError("webhook 111"))
      .mockResolvedValueOnce(undefined);
    await expect(
      deactivate({
        trigger: trigger([
          { topic: "orders/create", webhookId: 111 },
          { topic: "customers/create", webhookId: 222 },
        ]),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
    // 2 calls: 1st 404'd, 2nd succeeded.
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

  it("bails on Unauthorized401Error (merchant uninstalled — token revoked, all subsequent calls would 401)", async () => {
    mockDelete.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(
      deactivate({
        trigger: trigger([
          { topic: "orders/create", webhookId: 111 },
          { topic: "customers/create", webhookId: 222 },
        ]),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
    // Only the FIRST call ran — 401 short-circuits the loop.
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("propagates non-404 / non-401 errors (e.g. 5xx)", async () => {
    mockDelete.mockRejectedValueOnce(new Error("HTTP 500"));
    await expect(
      deactivate({
        trigger: trigger([{ topic: "orders/create", webhookId: 111 }]),
        integration: baseIntegration,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("returns silently when subscriptions array is missing", async () => {
    await expect(
      deactivate({
        trigger: trigger(undefined),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns silently when subscriptions array is empty", async () => {
    await expect(
      deactivate({
        trigger: trigger([]),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("falls back to config.shopDomain when integration.providerAccountId is empty", async () => {
    mockDelete.mockResolvedValue(undefined);
    await deactivate({
      trigger: trigger([{ topic: "orders/create", webhookId: 1 }], "stored.myshopify.com"),
      integration: { ...baseIntegration, providerAccountId: "" },
    });
    expect(mockDelete.mock.calls[0]![0].shopDomain).toBe(
      "stored.myshopify.com",
    );
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former index.test.ts
// Module-init registration assertion: importing the trigger index
// registers activate + deactivate hooks. NO subscription handler —
// Shopify webhook subscriptions don't expire (permanent endpoint
// pattern, same as Slice 11 / Stripe).
// ---------------------------------------------------------------------------
describe("index (lifecycle)", () => {

// Side-effect import — registers via _registry.ts.
describe("Shopify webhook_received trigger registration", () => {
  it("registers activation hook for ('shopify', 'webhook_received')", () => {
    expect(findActivation("shopify", "webhook_received")).not.toBeNull();
  });

  it("registers deactivation hook for ('shopify', 'webhook_received')", () => {
    expect(findDeactivation("shopify", "webhook_received")).not.toBeNull();
  });

  it("does NOT register a subscription handler — Shopify webhooks don't expire", () => {
    // Shopify webhook subscriptions are permanent until explicit
    // delete or merchant uninstall. V2's idiomatic opt-out is to omit
    // the subscription handler AND skip the
    // `config.type === "subscription-watch"` marker on the trigger
    // row. The runRenewals cron only enumerates rows with that
    // marker, so even if a stray subscription handler existed,
    // Shopify rows would be invisible to it.
    //
    // This test guards the registration side: no handler claims a
    // Shopify-shaped trigger row.
    const shopifyTrigger = {
      id: "tr-1",
      workflowId: "wf-1",
      workflowAccountId: "acct-1",
      userId: "u",
      provider: "shopify",
      eventType: "webhook_received",
      nodeId: "n-1",
      config: {
        webhookEnabled: true,
        shopDomain: "merchant.myshopify.com",
        topics: ["orders/create"],
        subscriptions: [{ topic: "orders/create", webhookId: 111 }],
      },
      providerAccountId: "merchant.myshopify.com",
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    expect(findSubscriptionHandler(shopifyTrigger)).toBeNull();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

describe("normalizeShopifyEvent — happy path", () => {
  it("uses X-Shopify-Webhook-Id as the eventId (preferred dedup key)", () => {
    const event = normalizeShopifyEvent({
      headers: {
        topic: "orders/create",
        shopDomain: "s.myshopify.com",
        webhookId: "wh-abc-123",
        triggeredAt: "2026-05-09T12:00:00Z",
      },
      body: { id: 999, email: "a@b.com" },
    });
    expect(event.eventId).toBe("wh-abc-123");
    expect(event.provider).toBe("shopify");
    expect(event.eventType).toBe("webhook_received");
    expect(event.providerAccountId).toBe("s.myshopify.com");
    expect(event.occurredAt).toBe("2026-05-09T12:00:00Z");
  });

  it("forwards the raw body verbatim under payload.body (no per-topic flattening)", () => {
    const body = {
      id: 999,
      total_price: "29.99",
      line_items: [{ variant_id: 1, quantity: 2 }],
      shipping_address: { city: "SF", country_code: "US" },
    };
    const event = normalizeShopifyEvent({
      headers: {
        topic: "orders/create",
        shopDomain: "s.myshopify.com",
        webhookId: "wh-1",
        triggeredAt: null,
      },
      body,
    });
    expect(event.payload.body).toBe(body);
  });

  it("includes topic + shopDomain + webhookId on the payload (workflow branching)", () => {
    const event = normalizeShopifyEvent({
      headers: {
        topic: "products/update",
        shopDomain: "s.myshopify.com",
        webhookId: "wh-2",
        triggeredAt: null,
      },
      body: { id: 1 },
    });
    expect(event.payload.topic).toBe("products/update");
    expect(event.payload.shopDomain).toBe("s.myshopify.com");
    expect(event.payload.webhookId).toBe("wh-2");
  });
});

describe("normalizeShopifyEvent — fallback dedup key", () => {
  it("uses ${shop}:${topic}:${body.id}:${body.updated_at} when webhook id header is absent", () => {
    const event = normalizeShopifyEvent({
      headers: {
        topic: "orders/updated",
        shopDomain: "s.myshopify.com",
        webhookId: null,
        triggeredAt: null,
      },
      body: {
        id: 1234,
        updated_at: "2026-05-09T12:00:00Z",
        created_at: "2026-05-08T00:00:00Z",
      },
    });
    expect(event.eventId).toBe(
      "s.myshopify.com:orders/updated:1234:2026-05-09T12:00:00Z",
    );
  });

  it("falls back to body.created_at when no updated_at is present", () => {
    const event = normalizeShopifyEvent({
      headers: {
        topic: "customers/create",
        shopDomain: "s.myshopify.com",
        webhookId: null,
        triggeredAt: null,
      },
      body: {
        id: 999,
        created_at: "2026-05-09T12:00:00Z",
      },
    });
    expect(event.eventId).toBe(
      "s.myshopify.com:customers/create:999:2026-05-09T12:00:00Z",
    );
  });

  it("uses placeholder strings when body has no id / timestamps", () => {
    const event = normalizeShopifyEvent({
      headers: {
        topic: "orders/create",
        shopDomain: "s.myshopify.com",
        webhookId: null,
        triggeredAt: null,
      },
      body: {},
    });
    expect(event.eventId).toBe(
      "s.myshopify.com:orders/create:no-id:no-ts",
    );
  });
});

describe("normalizeShopifyEvent — occurredAt fallback chain", () => {
  it("prefers the X-Shopify-Triggered-At header", () => {
    const event = normalizeShopifyEvent({
      headers: {
        topic: "x",
        shopDomain: "s.myshopify.com",
        webhookId: "w",
        triggeredAt: "2026-05-09T12:00:00Z",
      },
      body: { updated_at: "2026-04-01T00:00:00Z" },
    });
    expect(event.occurredAt).toBe("2026-05-09T12:00:00Z");
  });

  it("falls back to body.updated_at when triggeredAt missing", () => {
    const event = normalizeShopifyEvent({
      headers: {
        topic: "x",
        shopDomain: "s.myshopify.com",
        webhookId: "w",
        triggeredAt: null,
      },
      body: { updated_at: "2026-04-01T00:00:00Z" },
    });
    expect(event.occurredAt).toBe("2026-04-01T00:00:00Z");
  });

  it("falls back to body.created_at when both triggeredAt + updated_at missing", () => {
    const event = normalizeShopifyEvent({
      headers: {
        topic: "x",
        shopDomain: "s.myshopify.com",
        webhookId: "w",
        triggeredAt: null,
      },
      body: { created_at: "2026-03-01T00:00:00Z" },
    });
    expect(event.occurredAt).toBe("2026-03-01T00:00:00Z");
  });

  it("falls back to now() when no timestamps available", () => {
    const before = Date.now();
    const event = normalizeShopifyEvent({
      headers: {
        topic: "x",
        shopDomain: "s.myshopify.com",
        webhookId: "w",
        triggeredAt: null,
      },
      body: {},
    });
    const ts = Date.parse(event.occurredAt);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now() + 100);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former receive.test.ts
// Tests for `receiveShopifyWebhook` — the verify-and-parse helper that
// the route delegates to. Mocks the trigger_resources repo so we
// exercise:
// - Strict-direct-lookup query-param requirement.
// - Signature verification (delegates to verifyShopifySignature).
// - Missing topic / shop-domain headers.
// - Topic allowlist (intersection of activation-time selection +
// global Batch 1 allowlist).
// - Normalize → TriggerEvent shape.
// ---------------------------------------------------------------------------
describe("receive (lifecycle)", () => {

const SECRET = "test-app-secret";

function signBody(body: string, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

beforeEach(() => {
  mockFindByWorkflowAndNode.mockReset();
  process.env.SHOPIFY_CLIENT_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.SHOPIFY_CLIENT_SECRET;
});

function reqWith(opts: {
  query?: string;
  body?: string;
  hmac?: string | null;
  topic?: string | null;
  shopDomain?: string | null;
  webhookId?: string | null;
  triggeredAt?: string | null;
}): Request {
  const body = opts.body ?? '{"id":1}';
  const headers: Record<string, string> = {};
  if (opts.hmac !== null) headers["X-Shopify-Hmac-SHA256"] = opts.hmac ?? signBody(body);
  if (opts.topic !== null) headers["X-Shopify-Topic"] = opts.topic ?? "orders/create";
  if (opts.shopDomain !== null) headers["X-Shopify-Shop-Domain"] = opts.shopDomain ?? "s.myshopify.com";
  if (opts.webhookId !== undefined && opts.webhookId !== null) headers["X-Shopify-Webhook-Id"] = opts.webhookId;
  if (opts.triggeredAt !== undefined && opts.triggeredAt !== null) headers["X-Shopify-Triggered-At"] = opts.triggeredAt;
  return new Request(
    `https://app.example.test/api/webhooks/shopify${opts.query ?? "?workflowId=wf-1&nodeId=n-1"}`,
    { method: "POST", body, headers },
  );
}

function triggerRow(topics: string[] = ["orders/create"]) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "shopify",
    eventType: "webhook_received",
    nodeId: "n-1",
    config: { topics },
    providerAccountId: "s.myshopify.com",
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("receiveShopifyWebhook — strict-direct-lookup", () => {
  it("returns unknown_workflow when query string lacks workflowId", async () => {
    const result = await receiveShopifyWebhook(
      reqWith({ query: "?nodeId=n-1" }),
    );
    expect(result).toEqual({ kind: "unknown_workflow" });
    expect(mockFindByWorkflowAndNode).not.toHaveBeenCalled();
  });

  it("returns unknown_workflow when query string lacks nodeId", async () => {
    const result = await receiveShopifyWebhook(
      reqWith({ query: "?workflowId=wf-1" }),
    );
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("returns unknown_workflow when no trigger row matches", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(null);
    const result = await receiveShopifyWebhook(reqWith({}));
    expect(result).toEqual({ kind: "unknown_workflow" });
  });

  it("returns unknown_workflow when trigger row provider is wrong (defense-in-depth)", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce({
      ...triggerRow(),
      provider: "stripe",
    });
    const result = await receiveShopifyWebhook(reqWith({}));
    expect(result).toEqual({ kind: "unknown_workflow" });
  });
});

describe("receiveShopifyWebhook — signature verification", () => {
  it("throws InvalidSignatureError when X-Shopify-Hmac-SHA256 header is missing", async () => {
    await expect(
      receiveShopifyWebhook(reqWith({ hmac: null })),
    ).rejects.toThrow(InvalidSignatureError);
  });

  it("throws InvalidSignatureError when signature was computed with the wrong secret", async () => {
    const body = '{"id":1}';
    await expect(
      receiveShopifyWebhook(
        reqWith({ body, hmac: signBody(body, "wrong-secret") }),
      ),
    ).rejects.toThrow(/signature verification failed/);
  });

  it("throws InvalidSignatureError when SHOPIFY_CLIENT_SECRET is unset", async () => {
    delete process.env.SHOPIFY_CLIENT_SECRET;
    await expect(
      receiveShopifyWebhook(reqWith({})),
    ).rejects.toThrow(/SHOPIFY_CLIENT_SECRET/);
  });

  it("throws InvalidSignatureError on empty body", async () => {
    await expect(
      receiveShopifyWebhook(reqWith({ body: "" })),
    ).rejects.toThrow(/empty body/);
  });
});

describe("receiveShopifyWebhook — topic + shop-domain headers", () => {
  it("throws InvalidSignatureError when X-Shopify-Topic header is missing despite verified signature", async () => {
    await expect(
      receiveShopifyWebhook(reqWith({ topic: null })),
    ).rejects.toThrow(/X-Shopify-Topic.*missing/);
  });

  it("throws InvalidSignatureError when X-Shopify-Shop-Domain header is missing", async () => {
    await expect(
      receiveShopifyWebhook(reqWith({ shopDomain: null })),
    ).rejects.toThrow(/X-Shopify-Shop-Domain.*missing/);
  });
});

describe("receiveShopifyWebhook — topic allowlist", () => {
  it("returns unsupported_topic when topic is NOT in the trigger's activation-time selection", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(
      triggerRow(["orders/create"]),
    );
    // Activation-time topics: orders/create. Inbound topic: customers/create.
    const result = await receiveShopifyWebhook(
      reqWith({ topic: "customers/create" }),
    );
    expect(result).toEqual({
      kind: "unsupported_topic",
      topic: "customers/create",
    });
  });

  it("returns unsupported_topic when topic is in the activation list but NOT in the global Batch 1 allowlist (defense-in-depth)", async () => {
    // Hypothetical scenario: a corrupted trigger row carries a topic
    // V2 doesn't intend to handle (e.g. orders/cancelled). The global
    // allowlist catches it.
    mockFindByWorkflowAndNode.mockResolvedValueOnce(
      triggerRow(["orders/cancelled"]),
    );
    const result = await receiveShopifyWebhook(
      reqWith({ topic: "orders/cancelled" }),
    );
    expect(result).toEqual({
      kind: "unsupported_topic",
      topic: "orders/cancelled",
    });
  });
});

describe("receiveShopifyWebhook — happy path", () => {
  it("returns events[] with normalized payload on a valid signed delivery", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(
      triggerRow(["orders/create"]),
    );
    const body = '{"id":99,"email":"buyer@example.com","total_price":"29.99"}';
    const result = await receiveShopifyWebhook(
      reqWith({
        body,
        hmac: signBody(body),
        topic: "orders/create",
        webhookId: "wh-abc-123",
        triggeredAt: "2026-05-09T12:00:00Z",
      }),
    );
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.provider).toBe("shopify");
    expect(event.eventType).toBe("webhook_received");
    expect(event.eventId).toBe("wh-abc-123");
    expect(event.providerAccountId).toBe("s.myshopify.com");
    expect(event.payload.topic).toBe("orders/create");
    expect(event.payload.body).toEqual({
      id: 99,
      email: "buyer@example.com",
      total_price: "29.99",
    });
  });

  it("falls back to derived dedup key when X-Shopify-Webhook-Id is absent", async () => {
    mockFindByWorkflowAndNode.mockResolvedValueOnce(
      triggerRow(["orders/updated"]),
    );
    const body = '{"id":1234,"updated_at":"2026-05-09T12:00:00Z"}';
    const result = await receiveShopifyWebhook(
      reqWith({
        body,
        hmac: signBody(body),
        topic: "orders/updated",
        webhookId: undefined,
      }),
    );
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.events[0]!.eventId).toBe(
      "s.myshopify.com:orders/updated:1234:2026-05-09T12:00:00Z",
    );
  });
});

});
