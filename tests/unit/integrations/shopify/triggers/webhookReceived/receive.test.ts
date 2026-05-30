/**
 * @jest-environment node
 *
 * Tests for `receiveShopifyWebhook` — the verify-and-parse helper that
 * the route delegates to. Mocks the trigger_resources repo so we
 * exercise:
 *   - Strict-direct-lookup query-param requirement.
 *   - Signature verification (delegates to verifyShopifySignature).
 *   - Missing topic / shop-domain headers.
 *   - Topic allowlist (intersection of activation-time selection +
 *     global Batch 1 allowlist).
 *   - Normalize → TriggerEvent shape.
 */
import { createHmac } from "node:crypto";

const mockFindByWorkflowAndNode = jest.fn();

jest.mock("@/repositories/triggerResources", () => ({
  findByWorkflowAndNode: (...args: unknown[]) =>
    mockFindByWorkflowAndNode(...args),
}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { receiveShopifyWebhook } from "@/integrations/shopify/triggers/webhookReceived/receive";

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
