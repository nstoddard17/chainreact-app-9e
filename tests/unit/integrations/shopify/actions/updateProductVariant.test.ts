/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockVariantsUpdate = jest.fn();
const mockVariantsCreate = jest.fn();
const mockResolveShop = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
}));

jest.mock("@/integrations/_shared/shopify/api/products", () => ({
  variantsUpdate: (...args: unknown[]) => mockVariantsUpdate(...args),
  variantsCreate: (...args: unknown[]) => mockVariantsCreate(...args),
  productsCreate: jest.fn(),
  productsUpdate: jest.fn(),
}));

jest.mock("@/integrations/shopify/actions/_resolveShop", () => ({
  resolveShopDomain: (...args: unknown[]) => mockResolveShop(...args),
}));

import { updateProductVariant } from "@/integrations/shopify/actions/updateProductVariant";
import { UpdateProductVariantConfigSchema } from "@/integrations/shopify/actions/updateProductVariant.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockVariantsUpdate.mockReset();
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

describe("update_product_variant action — Shopify 2.1 Commit 1", () => {
  it("calls variantsUpdate ONCE with mapped fields (no per-field loop, no variantsCreate)", async () => {
    mockVariantsUpdate.mockResolvedValueOnce({
      id: 22,
      product_id: 9,
      price: "44.99",
      sku: "PROD-V2",
    });
    await updateProductVariant({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        variant_id: 22,
        price: "44.99",
        sku: "PROD-V2",
      },
      triggerEvent: trigger(),
    });
    expect(mockVariantsUpdate).toHaveBeenCalledTimes(1);
    expect(mockVariantsCreate).not.toHaveBeenCalled();
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
  });

  it("forwards all documented optional fields to the wrapper", async () => {
    mockVariantsUpdate.mockResolvedValueOnce({ id: 22, product_id: 9 });
    await updateProductVariant({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        variant_id: 22,
        price: "44.99",
        compare_at_price: "59.99",
        sku: "PROD-V2",
        barcode: "1234567",
        option1: "Large",
        option2: "Red",
        option3: "Cotton",
        weight: 1.5,
        weight_unit: "kg",
        taxable: true,
      },
      triggerEvent: trigger(),
    });
    const callArg = mockVariantsUpdate.mock.calls[0]![0]!;
    expect(callArg.shopDomain).toBe("s.myshopify.com");
    expect(callArg.variantId).toBe(22);
    expect(callArg.price).toBe("44.99");
    expect(callArg.compare_at_price).toBe("59.99");
    expect(callArg.sku).toBe("PROD-V2");
    expect(callArg.barcode).toBe("1234567");
    expect(callArg.option1).toBe("Large");
    expect(callArg.option2).toBe("Red");
    expect(callArg.option3).toBe("Cotton");
    expect(callArg.weight).toBe(1.5);
    expect(callArg.weight_unit).toBe("kg");
    expect(callArg.taxable).toBe(true);
  });

  it("omits optional fields when not supplied (no spurious undefined keys forwarded)", async () => {
    mockVariantsUpdate.mockResolvedValueOnce({ id: 22, product_id: 9 });
    await updateProductVariant({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { variant_id: 22, price: "44.99" },
      triggerEvent: trigger(),
    });
    const callArg = mockVariantsUpdate.mock.calls[0]![0]!;
    expect(callArg.sku).toBeUndefined();
    expect(callArg.barcode).toBeUndefined();
    expect(callArg.compare_at_price).toBeUndefined();
    expect(callArg.option1).toBeUndefined();
    expect(callArg.weight).toBeUndefined();
    expect(callArg.weight_unit).toBeUndefined();
    expect(callArg.taxable).toBeUndefined();
  });

  it("threads accountId from resolveShopDomain into refreshAndRetry", async () => {
    mockResolveShop.mockResolvedValueOnce({
      shopDomain: "alpha.myshopify.com",
      providerAccountId: "alpha.myshopify.com",
    });
    mockVariantsUpdate.mockResolvedValueOnce({ id: 22, product_id: 9 });
    await updateProductVariant({
      workflowId: "wf",
      userId: "u-123",
      accountId: "acct-u-123",
      runId: "r",
      nodeId: "n",
      config: { variant_id: 22, price: "44.99" },
      triggerEvent: trigger(),
    });
    const refreshArg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(refreshArg.accountId).toBe("acct-u-123");
    expect(refreshArg.provider).toBe("shopify");
    expect(refreshArg.providerAccountId).toBe("alpha.myshopify.com");
    expect(mockVariantsUpdate.mock.calls[0]![0]!.shopDomain).toBe(
      "alpha.myshopify.com",
    );
  });

  it("returns bounded output projection (no raw Shopify response spread)", async () => {
    mockVariantsUpdate.mockResolvedValueOnce({
      id: 22,
      product_id: 9,
      title: "Large / Red",
      sku: "PROD-V2",
      price: "44.99",
      compare_at_price: "59.99",
      barcode: "1234567",
      option1: "Large",
      option2: "Red",
      option3: "Cotton",
      inventory_item_id: 7777,
      updated_at: "2026-05-15T12:00:00Z",
      // Defensive: extra Shopify fields the wrapper response may surface.
      // The handler MUST NOT spread these into output.
      inventory_quantity: 50,
      requires_shipping: true,
      fulfillment_service: "manual",
    });
    const result = await updateProductVariant({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { variant_id: 22, price: "44.99" },
      triggerEvent: trigger(),
    });
    expect(Object.keys(result.output).sort()).toEqual([
      "adminUrl",
      "barcode",
      "compareAtPrice",
      "inventoryItemId",
      "option1",
      "option2",
      "option3",
      "price",
      "productId",
      "sku",
      "success",
      "title",
      "updatedAt",
      "variantId",
    ]);
    expect(result.output.variantId).toBe(22);
    expect(result.output.productId).toBe(9);
    expect(result.output.title).toBe("Large / Red");
    expect(result.output.price).toBe("44.99");
    expect(result.output.compareAtPrice).toBe("59.99");
    expect(result.output.sku).toBe("PROD-V2");
    expect(result.output.barcode).toBe("1234567");
    expect(result.output.option1).toBe("Large");
    expect(result.output.option2).toBe("Red");
    expect(result.output.option3).toBe("Cotton");
    expect(result.output.inventoryItemId).toBe(7777);
    expect(result.output.updatedAt).toBe("2026-05-15T12:00:00Z");
    expect(result.output.adminUrl).toBe(
      "https://s.myshopify.com/admin/products/9/variants/22",
    );
    // V1 inventory side-channel + Shopify wire extras NEVER appear in output.
    expect(result.output).not.toHaveProperty("inventory_quantity");
    expect(result.output).not.toHaveProperty("requires_shipping");
    expect(result.output).not.toHaveProperty("fulfillment_service");
    expect(result.output).not.toHaveProperty("inventoryQuantity");
  });

  it("falls back to null for fields Shopify omits + constructs a no-product adminUrl when product_id missing", async () => {
    mockVariantsUpdate.mockResolvedValueOnce({
      id: 22, // product_id omitted
    });
    const result = await updateProductVariant({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { variant_id: 22, price: "44.99" },
      triggerEvent: trigger(),
    });
    expect(result.output.productId).toBeNull();
    expect(result.output.title).toBeNull();
    expect(result.output.price).toBeNull();
    expect(result.output.compareAtPrice).toBeNull();
    expect(result.output.sku).toBeNull();
    expect(result.output.barcode).toBeNull();
    expect(result.output.option1).toBeNull();
    expect(result.output.inventoryItemId).toBeNull();
    expect(result.output.updatedAt).toBeNull();
    expect(result.output.adminUrl).toBe(
      "https://s.myshopify.com/admin/variants/22",
    );
  });

  it("Zod parse rejects BEFORE the wrapper call when no update field is supplied", async () => {
    await expect(
      updateProductVariant({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { variant_id: 22 } as Record<string, unknown>,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockResolveShop).not.toHaveBeenCalled();
    expect(mockVariantsUpdate).not.toHaveBeenCalled();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("Zod parse rejects BEFORE the wrapper call when an inventory field is smuggled in", async () => {
    await expect(
      updateProductVariant({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          variant_id: 22,
          price: "44.99",
          inventory_quantity: 50,
        } as Record<string, unknown>,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockVariantsUpdate).not.toHaveBeenCalled();
  });

  it("propagates Shopify error from the wrapper (e.g. 422 invalid value)", async () => {
    mockVariantsUpdate.mockRejectedValueOnce(
      new Error(
        "Shopify PUT /variants/22.json failed: invalid value for weight_unit",
      ),
    );
    await expect(
      updateProductVariant({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { variant_id: 22, weight: 1.5, weight_unit: "kg" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/invalid value for weight_unit/);
    expect(mockVariantsUpdate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling updateProductVariant.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// ---------------------------------------------------------------------------

describe("UpdateProductVariantConfigSchema", () => {
  it("accepts a minimal valid config with variant_id + one update field", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      variant_id: 22,
      price: "44.99",
    });
    expect(result.success).toBe(true);
  });

  it("accepts string variant_id", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      variant_id: "22",
      price: "44.99",
    });
    expect(result.success).toBe(true);
  });

  it("accepts the full optional field set", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      variant_id: 22,
      price: "44.99",
      compare_at_price: "59.99",
      sku: "PROD-V2",
      barcode: "1234567",
      option1: "Large",
      option2: "Red",
      option3: "Cotton",
      weight: 1.5,
      weight_unit: "kg",
      taxable: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing variant_id", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      price: "44.99",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty-string variant_id", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      variant_id: "",
      price: "44.99",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero / negative numeric variant_id", () => {
    expect(
      UpdateProductVariantConfigSchema.safeParse({
        variant_id: 0,
        price: "44.99",
      }).success,
    ).toBe(false);
    expect(
      UpdateProductVariantConfigSchema.safeParse({
        variant_id: -5,
        price: "44.99",
      }).success,
    ).toBe(false);
  });

  it("rejects a variant_id-only config (no update fields)", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      variant_id: 22,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(" ");
      expect(message).toMatch(/at least one mutable field/i);
    }
  });

  it("rejects invalid weight_unit (Shopify only supports g / kg / oz / lb)", () => {
    expect(
      UpdateProductVariantConfigSchema.safeParse({
        variant_id: 22,
        weight: 1.5,
        weight_unit: "ton",
      }).success,
    ).toBe(false);
    expect(
      UpdateProductVariantConfigSchema.safeParse({
        variant_id: 22,
        weight: 1.5,
        weight_unit: "G",
      }).success,
    ).toBe(false);
  });

  it("accepts each documented weight_unit value", () => {
    for (const unit of ["g", "kg", "oz", "lb"] as const) {
      expect(
        UpdateProductVariantConfigSchema.safeParse({
          variant_id: 22,
          weight: 1.5,
          weight_unit: unit,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects inventory_quantity (variant inventory goes through update_inventory)", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      variant_id: 22,
      price: "44.99",
      inventory_quantity: 50,
    });
    expect(result.success).toBe(false);
  });

  it("rejects inventory_item_id (variant inventory goes through update_inventory)", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      variant_id: 22,
      price: "44.99",
      inventory_item_id: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects inventory_management (variant inventory goes through update_inventory)", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      variant_id: 22,
      price: "44.99",
      inventory_management: "shopify",
    });
    expect(result.success).toBe(false);
  });

  it("rejects raw Shopify wire-format payload (no `variant: {...}` wrapper accepted at schema)", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      variant: { id: 22, price: "44.99" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (.strict)", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      variant_id: 22,
      price: "44.99",
      something_extra: "boom",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative weight", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      variant_id: 22,
      weight: -1.5,
      weight_unit: "kg",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a single barcode-only update (any one mutable field is enough)", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      variant_id: 22,
      barcode: "1234567",
    });
    expect(result.success).toBe(true);
  });

  it("accepts taxable: false as a valid update", () => {
    const result = UpdateProductVariantConfigSchema.safeParse({
      variant_id: 22,
      taxable: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty-string optional fields (min(1))", () => {
    expect(
      UpdateProductVariantConfigSchema.safeParse({
        variant_id: 22,
        sku: "",
      }).success,
    ).toBe(false);
    expect(
      UpdateProductVariantConfigSchema.safeParse({
        variant_id: 22,
        barcode: "",
      }).success,
    ).toBe(false);
  });
});
