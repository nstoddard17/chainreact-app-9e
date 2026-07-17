/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockVariantsCreate = jest.fn();
const mockResolveShop = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
}));

jest.mock("@/integrations/_shared/shopify/api/products", () => ({
  variantsCreate: (...args: unknown[]) => mockVariantsCreate(...args),
  productsCreate: jest.fn(),
  productsUpdate: jest.fn(),
}));

jest.mock("@/integrations/shopify/actions/_resolveShop", () => ({
  resolveShopDomain: (...args: unknown[]) => mockResolveShop(...args),
}));

import { createProductVariant } from "@/integrations/shopify/actions/createProductVariant";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockVariantsCreate.mockReset();
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

describe("createProductVariant", () => {
  it("creates a variant and returns mapped output", async () => {
    mockVariantsCreate.mockResolvedValueOnce({
      id: 22,
      product_id: 9,
      sku: "SKU-22",
      price: "39.99",
      inventory_item_id: 4455,
      created_at: "2026-05-09T12:00:00Z",
    });
    const result = await createProductVariant({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: {
        product_id: 9,
        price: "39.99",
        option1: "Large",
        sku: "SKU-22",
      },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      success: true,
      variantId: 22,
      productId: 9,
      // RESOLVERS-2 sweep: update_inventory.inventory_item_id is justified as
      // an upstream-mapped field, but this action — the natural producer for
      // "create a variant, then set its stock" — never emitted it, so the flow
      // the docs described could not actually be built. Shopify returns it on
      // the created variant.
      inventoryItemId: 4455,
      sku: "SKU-22",
      price: "39.99",
      adminUrl: "https://s.myshopify.com/admin/products/9/variants/22",
      createdAt: "2026-05-09T12:00:00Z",
    });
  });

  it("emits inventoryItemId: null when Shopify omits it, rather than dropping the key", async () => {
    // Bounded-output rule: the key set is fixed. A downstream {{...}} mapping
    // must see an explicit null instead of an absent variable.
    mockVariantsCreate.mockResolvedValueOnce({
      id: 23,
      product_id: 9,
      price: "1.00",
      created_at: "2026-05-09T12:00:00Z",
    });
    const result = await createProductVariant({
      workflowId: "wf-1",
      userId: "u-1",
      accountId: "acct-u-1",
      runId: "run-1",
      nodeId: "n-1",
      config: { product_id: 9, price: "1.00", option1: "S" },
      triggerEvent: trigger(),
    });
    expect(result.output).toHaveProperty("inventoryItemId", null);
  });

  it("rejects missing required price / product_id", async () => {
    await expect(
      createProductVariant({
        workflowId: "wf-1",
        userId: "u-1",
        accountId: "acct-u-1",
        runId: "run-1",
        nodeId: "n-1",
        config: { product_id: 9 } as Record<string, unknown>,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
