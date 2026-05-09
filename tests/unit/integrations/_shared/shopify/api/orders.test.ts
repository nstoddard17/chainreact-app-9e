/**
 * @jest-environment node
 *
 * Tests for `/orders` resource wrappers. Mocks `shopifyRequest` so we
 * snapshot the URL + body the wrappers construct without testing the
 * shared HTTP layer twice (covered in _request.test.ts).
 */
const mockShopifyRequest = jest.fn();

jest.mock("@/integrations/_shared/shopify/api/_request", () => ({
  shopifyRequest: (...args: unknown[]) => mockShopifyRequest(...args),
}));

import {
  ordersCancel,
  ordersCreate,
  ordersGet,
  ordersUpdate,
} from "@/integrations/_shared/shopify/api/orders";

beforeEach(() => {
  mockShopifyRequest.mockReset();
});

describe("ordersCreate", () => {
  it("posts /orders.json with `send_receipt` (Q11 gate maps to wire field directly)", async () => {
    mockShopifyRequest.mockResolvedValueOnce({
      order: { id: 1, order_number: 1001 },
    });
    await ordersCreate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      email: "buyer@example.com",
      line_items: [{ variant_id: 555, quantity: 2 }],
      send_receipt: true,
    });
    expect(mockShopifyRequest).toHaveBeenCalledWith({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      method: "POST",
      path: "/orders.json",
      body: {
        order: {
          email: "buyer@example.com",
          line_items: [{ variant_id: 555, quantity: 2 }],
          send_receipt: true,
        },
      },
      resourceForNotFound: "order (create)",
    });
  });

  it("includes optional addresses + tags + note when supplied", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ order: { id: 2 } });
    await ordersCreate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      email: "buyer@example.com",
      line_items: [{ variant_id: 555, quantity: 1 }],
      send_receipt: false,
      tags: "wholesale",
      note: "rush",
      shipping_address: { city: "SF", country_code: "US" },
      billing_address: { city: "LA", country_code: "US" },
      financial_status: "paid",
    });
    const sent = mockShopifyRequest.mock.calls[0]![0]!.body;
    expect(sent.order).toMatchObject({
      tags: "wholesale",
      note: "rush",
      shipping_address: { city: "SF", country_code: "US" },
      billing_address: { city: "LA", country_code: "US" },
      financial_status: "paid",
      send_receipt: false,
    });
  });

  it("returns the response.order verbatim", async () => {
    mockShopifyRequest.mockResolvedValueOnce({
      order: { id: 9, order_number: 1234 },
    });
    const result = await ordersCreate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      email: "a@example.com",
      line_items: [{ variant_id: 1, quantity: 1 }],
      send_receipt: true,
    });
    expect(result).toEqual({ id: 9, order_number: 1234 });
  });
});

describe("ordersGet", () => {
  it("GETs /orders/{id}.json with URL-encoded id", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ order: { id: 1234567890 } });
    await ordersGet({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      orderId: 1234567890,
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.method).toBe("GET");
    expect(mockShopifyRequest.mock.calls[0]![0]!.path).toBe(
      "/orders/1234567890.json",
    );
  });
});

describe("ordersUpdate", () => {
  it("PUTs /orders/{id}.json with only the supplied fields (id always present)", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ order: { id: 1, tags: "x" } });
    await ordersUpdate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      orderId: 1,
      fields: { tags: "x, y" },
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.body).toEqual({
      order: { id: 1, tags: "x, y" },
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.method).toBe("PUT");
  });

  it("omits unspecified fields", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ order: { id: 1 } });
    await ordersUpdate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      orderId: 1,
      fields: { note: "internal" },
    });
    const order = mockShopifyRequest.mock.calls[0]![0]!.body.order;
    expect(order.note).toBe("internal");
    expect(order.tags).toBeUndefined();
  });
});

describe("ordersCancel", () => {
  it("POSTs /orders/{id}/cancel.json with email = notify_customer", async () => {
    mockShopifyRequest.mockResolvedValueOnce({
      order: { id: 1, cancelled_at: "2026-05-09T12:00:00Z" },
    });
    await ordersCancel({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      orderId: 1,
      notify_customer: true,
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.path).toBe(
      "/orders/1/cancel.json",
    );
    expect(mockShopifyRequest.mock.calls[0]![0]!.body).toEqual({ email: true });
  });

  it("includes optional reason + restock", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ order: { id: 1 } });
    await ordersCancel({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      orderId: 1,
      notify_customer: false,
      reason: "customer",
      restock: true,
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.body).toEqual({
      email: false,
      reason: "customer",
      restock: true,
    });
  });
});
