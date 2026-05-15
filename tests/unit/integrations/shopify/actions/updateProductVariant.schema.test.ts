/**
 * @jest-environment node
 */
import { UpdateProductVariantConfigSchema } from "@/integrations/shopify/actions/updateProductVariant.schema";

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
