/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockProductsCreate = jest.fn();
const mockResolveShop = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
}));

jest.mock("@/integrations/_shared/shopify/api/products", () => ({
  productsCreate: (...args: unknown[]) => mockProductsCreate(...args),
  productsUpdate: jest.fn(),
  variantsCreate: jest.fn(),
}));

jest.mock("@/integrations/shopify/actions/_resolveShop", () => ({
  resolveShopDomain: (...args: unknown[]) => mockResolveShop(...args),
}));

import { createProduct } from "@/integrations/shopify/actions/createProduct";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockProductsCreate.mockReset();
  mockResolveShop.mockReset();
  mockResolveShop.mockResolvedValue({
    shopDomain: "s.myshopify.com",
    accountId: "s.myshopify.com",
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
    accountId: "s.myshopify.com",
    payload: {},
  };
}

describe("createProduct", () => {
  it("creates a product and returns id + variantId from default variant", async () => {
    mockProductsCreate.mockResolvedValueOnce({
      id: 9,
      title: "Hat",
      vendor: "Acme",
      variants: [{ id: 99 }],
      created_at: "2026-05-09T12:00:00Z",
    });
    const result = await createProduct({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { title: "Hat", price: "29.99", vendor: "Acme" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      productId: 9,
      variantId: 99,
      title: "Hat",
      vendor: "Acme",
      adminUrl: "https://s.myshopify.com/admin/products/9",
      createdAt: "2026-05-09T12:00:00Z",
    });
  });

  it("wraps the call in refreshAndRetry pinned to provider=shopify", async () => {
    mockProductsCreate.mockResolvedValueOnce({ id: 1, variants: [] });
    await createProduct({
      workflowId: "wf-1",
      userId: "u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { title: "X", price: "1.00" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("shopify");
  });

  it("rejects missing required title / price", async () => {
    await expect(
      createProduct({
        workflowId: "wf-1",
        userId: "u-1",
        runId: "run-1",
        nodeId: "n-1",
        config: { price: "1.00" } as Record<string, unknown>,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
