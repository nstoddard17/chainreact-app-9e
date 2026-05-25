/**
 * @jest-environment node
 *
 * Tests for the Shopify webhooks REST wrapper. Mocks `shopifyRequest`
 * so we snapshot the URL + body + auth without going through the
 * shared HTTP layer.
 */
const mockShopifyRequest = jest.fn();

jest.mock("@/integrations/_shared/shopify/api/_request", () => ({
  shopifyRequest: (...args: unknown[]) => mockShopifyRequest(...args),
}));

import {
  webhooksCreate,
  webhooksDelete,
} from "@/integrations/_shared/shopify/api/webhooks";

beforeEach(() => {
  mockShopifyRequest.mockReset();
});

describe("webhooksCreate", () => {
  it("POSTs /webhooks.json with topic + address + format=json wrapped under `webhook`", async () => {
    mockShopifyRequest.mockResolvedValueOnce({
      webhook: { id: 1234567, topic: "orders/create" },
    });
    const result = await webhooksCreate({
      shopDomain: "s.myshopify.com",
      accessToken: "shpat_x",
      topic: "orders/create",
      address: "https://app.example.test/api/webhooks/shopify?workflowId=wf-1&nodeId=n-1",
    });
    expect(mockShopifyRequest).toHaveBeenCalledWith({
      shopDomain: "s.myshopify.com",
      accessToken: "shpat_x",
      method: "POST",
      path: "/webhooks.json",
      body: {
        webhook: {
          topic: "orders/create",
          address:
            "https://app.example.test/api/webhooks/shopify?workflowId=wf-1&nodeId=n-1",
          format: "json",
        },
      },
      resourceForNotFound: "webhook (create topic orders/create)",
    });
    expect(result).toEqual({ id: 1234567, topic: "orders/create" });
  });

  it("uses the merchant access token (NOT a platform secret — distinct from Stripe)", async () => {
    mockShopifyRequest.mockResolvedValueOnce({ webhook: { id: 1, topic: "x" } });
    await webhooksCreate({
      shopDomain: "s.myshopify.com",
      accessToken: "shpat_merchant_xxx",
      topic: "products/update",
      address: "https://app.example.test/api/webhooks/shopify?workflowId=w&nodeId=n",
    });
    expect(mockShopifyRequest.mock.calls[0]![0].accessToken).toBe(
      "shpat_merchant_xxx",
    );
  });
});

describe("webhooksDelete", () => {
  it("DELETEs /webhooks/{id}.json with merchant token", async () => {
    mockShopifyRequest.mockResolvedValueOnce({});
    await webhooksDelete({
      shopDomain: "s.myshopify.com",
      accessToken: "shpat_x",
      webhookId: 1234567,
    });
    expect(mockShopifyRequest).toHaveBeenCalledWith({
      shopDomain: "s.myshopify.com",
      accessToken: "shpat_x",
      method: "DELETE",
      path: "/webhooks/1234567.json",
      resourceForNotFound: "webhook 1234567",
    });
  });

  it("propagates errors from the shared request layer (404 surfaces as NotFoundError downstream)", async () => {
    mockShopifyRequest.mockRejectedValueOnce(new Error("HTTP 500"));
    await expect(
      webhooksDelete({
        shopDomain: "s.myshopify.com",
        accessToken: "shpat_x",
        webhookId: 1,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });
});
