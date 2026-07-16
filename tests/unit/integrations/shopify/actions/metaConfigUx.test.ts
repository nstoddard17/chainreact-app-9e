/**
 * @jest-environment node
 *
 * RESOLVERS-1 — Shopify meta pins for the product-picker fields.
 *
 * Pins:
 *   - `update_product.product_id` and `create_product_variant.product_id`
 *     are `shopify:products` comboboxes with `allowManualEntry: true` — the
 *     committed value stays the raw numeric-id string, which the runtime
 *     schemas' `z.union([z.string().min(1), z.number()...])` accept, so
 *     pasted ids and `{{...}}` wiring keep working.
 *   - `update_inventory.location_id` stays free text: the shop-locations
 *     list endpoint (`GET /locations.json`) is gated on `read_locations`
 *     as of API 2024-10 and the Shopify manifest does not grant it —
 *     documented RESOLVERS-1 skip (no new scopes).
 */
import { shopifyUpdateProductMeta } from "@/integrations/shopify/actions/updateProduct.meta";
import { shopifyCreateProductVariantMeta } from "@/integrations/shopify/actions/createProductVariant.meta";
import { shopifyUpdateInventoryMeta } from "@/integrations/shopify/actions/updateInventory.meta";
import { UpdateProductConfigSchema } from "@/integrations/shopify/actions/updateProduct.schema";
import { CreateProductVariantConfigSchema } from "@/integrations/shopify/actions/createProductVariant.schema";
import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";

function field(meta: ActionMeta, name: string): FieldMeta {
  const f = meta.fields.find((x) => x.name === name);
  if (!f) throw new Error(`${meta.key} has no field '${name}'`);
  return f;
}

describe("shopify product_id fields — shopify:products combobox + manual entry", () => {
  it.each([
    [shopifyUpdateProductMeta.key, shopifyUpdateProductMeta],
    [shopifyCreateProductVariantMeta.key, shopifyCreateProductVariantMeta],
  ] as const)("%s.product_id is a shopify:products combobox", (_key, meta) => {
    const f = field(meta, "product_id");
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("shopify:products");
    expect(f.allowManualEntry).toBe(true);
    expect(f.required).toBe(true);
    expect(f.dependsOn).toBeUndefined();
    expect(f.options).toBeUndefined();
  });

  it("the combobox's string value round-trips through both runtime schemas", () => {
    expect(() =>
      UpdateProductConfigSchema.parse({ product_id: "632910392", title: "T" }),
    ).not.toThrow();
    expect(() =>
      CreateProductVariantConfigSchema.parse({
        product_id: "632910392",
        price: "39.99",
      }),
    ).not.toThrow();
  });
});

describe("shopify update_inventory.location_id — documented RESOLVERS-1 skip", () => {
  it("stays free text (locations list needs the ungranted read_locations scope)", () => {
    const f = field(shopifyUpdateInventoryMeta, "location_id");
    expect(f.type).toBe("text");
    expect(f.optionsSource).toBeUndefined();
  });
});
