/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockProductsUpdate = jest.fn();
const mockResolveShop = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
}));

jest.mock("@/integrations/_shared/shopify/api/products", () => ({
  productsUpdate: (...args: unknown[]) => mockProductsUpdate(...args),
  productsCreate: jest.fn(),
  variantsCreate: jest.fn(),
}));

jest.mock("@/integrations/shopify/actions/_resolveShop", () => ({
  resolveShopDomain: (...args: unknown[]) => mockResolveShop(...args),
}));

import { updateProduct } from "@/integrations/shopify/actions/updateProduct";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockProductsUpdate.mockReset();
  mockResolveShop.mockReset();
  mockResolveShop.mockResolvedValue({
    shopDomain: "s.myshopify.com",
    providerAccountId: "s.myshopify.com",
  });
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "shopify",
    eventType: "webhook_received",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    providerAccountId: "s.myshopify.com",
    payload: {},
  };
}

describe("updateProduct", () => {
  it("updates a product and returns mapped output", async () => {
    mockProductsUpdate.mockResolvedValueOnce({
      id: 9,
      title: "Updated",
      status: "active",
      updated_at: "2026-05-09T12:00:00Z",
    });
    const result = await updateProduct({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { product_id: 9, title: "Updated", published: true },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      success: true,
      productId: 9,
      title: "Updated",
      status: "active",
      adminUrl: "https://s.myshopify.com/admin/products/9",
      updatedAt: "2026-05-09T12:00:00Z",
    });
    expect(mockProductsUpdate.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        productId: 9,
        title: "Updated",
        published: true,
      }),
    );
  });

  it("threads each optional field through to the wrapper", async () => {
    mockProductsUpdate.mockResolvedValueOnce({ id: 9 });
    await updateProduct({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: {
        product_id: 9,
        body_html: "<p>desc</p>",
        vendor: "Acme",
        product_type: "Apparel",
        tags: "new, sale",
      },
      triggerEvent: trigger(),
    });
    expect(mockProductsUpdate.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        body_html: "<p>desc</p>",
        vendor: "Acme",
        product_type: "Apparel",
        tags: "new, sale",
      }),
    );
  });
});
