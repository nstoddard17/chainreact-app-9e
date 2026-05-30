import { normalizeShopifyEvent } from "@/integrations/shopify/triggers/webhookReceived/normalize";

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
