const mockShopifyRequest = jest.fn();

jest.mock("@/integrations/_shared/shopify/api/_request", () => ({
  shopifyRequest: (...args: unknown[]) => mockShopifyRequest(...args),
}));

import {
  fulfillmentOrdersList,
  fulfillmentsCreate,
} from "@/integrations/_shared/shopify/api/fulfillments";

beforeEach(() => {
  mockShopifyRequest.mockReset();
});

describe("fulfillmentOrdersList", () => {
  it("GETs /orders/{id}/fulfillment_orders.json", async () => {
    mockShopifyRequest.mockResolvedValueOnce({
      fulfillment_orders: [{ id: 100, status: "open", line_items: [] }],
    });
    const result = await fulfillmentOrdersList({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      orderId: 999,
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.path).toBe(
      "/orders/999/fulfillment_orders.json",
    );
    expect(mockShopifyRequest.mock.calls[0]![0]!.method).toBe("GET");
    expect(result).toEqual([{ id: 100, status: "open", line_items: [] }]);
  });

  it("returns [] when response has no fulfillment_orders array", async () => {
    mockShopifyRequest.mockResolvedValueOnce({});
    const result = await fulfillmentOrdersList({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      orderId: 1,
    });
    expect(result).toEqual([]);
  });
});

describe("fulfillmentsCreate", () => {
  it("POSTs /fulfillments.json with line_items_by_fulfillment_order + notify_customer", async () => {
    mockShopifyRequest.mockResolvedValueOnce({
      fulfillment: { id: 1 },
    });
    await fulfillmentsCreate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      fulfillment_order_id: 100,
      line_items: [
        { id: 11, quantity: 2 },
        { id: 12, quantity: 1 },
      ],
      notify_customer: true,
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.body).toEqual({
      fulfillment: {
        notify_customer: true,
        line_items_by_fulfillment_order: [
          {
            fulfillment_order_id: 100,
            fulfillment_order_line_items: [
              { id: 11, quantity: 2 },
              { id: 12, quantity: 1 },
            ],
          },
        ],
      },
    });
    expect(mockShopifyRequest.mock.calls[0]![0]!.path).toBe("/fulfillments.json");
  });

  it("includes tracking_info when supplied", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ fulfillment: { id: 1 } });
    await fulfillmentsCreate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      fulfillment_order_id: 100,
      line_items: [{ id: 11, quantity: 1 }],
      notify_customer: false,
      tracking_info: { number: "1Z999", company: "UPS" },
    });
    expect(
      mockShopifyRequest.mock.calls[0]![0]!.body.fulfillment.tracking_info,
    ).toEqual({ number: "1Z999", company: "UPS" });
  });

  it("does NOT include tracking_info when undefined (no key in body)", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ fulfillment: { id: 1 } });
    await fulfillmentsCreate({
      shopDomain: "s.myshopify.com",
      accessToken: "tok",
      fulfillment_order_id: 100,
      line_items: [{ id: 11, quantity: 1 }],
      notify_customer: false,
    });
    const fulfillment = mockShopifyRequest.mock.calls[0]![0]!.body.fulfillment;
    expect(fulfillment).not.toHaveProperty("tracking_info");
  });
});
