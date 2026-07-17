/**
 * @jest-environment node
 *
 * RESOLVERS-1 / RESOLVERS-2 — Shopify meta pins for the id-picker fields.
 *
 * Every picker below is a `combobox` + `optionsSource` + `allowManualEntry:
 * true`. The committed value stays the raw numeric-id STRING, which the
 * runtime schemas' `z.union([z.string().min(1), z.number()...])` accept —
 * so pasted ids and `{{...}}` upstream mapping keep working unchanged. No
 * runtime schema, field name, or handler changed for either slice.
 *
 * Pins:
 *   - RESOLVERS-1: `update_product.product_id` +
 *     `create_product_variant.product_id` → `shopify:products`.
 *   - RESOLVERS-2: `update_order_status` / `add_order_note` /
 *     `create_fulfillment` `.order_id` → `shopify:orders`;
 *     `update_product_variant.variant_id` → `shopify:variants` (flat, no
 *     dep — no sibling product field exists to cascade from);
 *     `update_inventory.location_id` → `shopify:locations` (supersedes the
 *     RESOLVERS-1 skip: `read_locations` is now an OPTIONAL manifest scope).
 *   - `update_inventory.inventory_item_id` stays TEXT — a justified
 *     upstream-mapping field (no listable, merchant-recognizable resource
 *     exists behind it).
 */
import { shopifyUpdateProductMeta } from "@/integrations/shopify/actions/updateProduct.meta";
import { shopifyCreateProductVariantMeta } from "@/integrations/shopify/actions/createProductVariant.meta";
import { shopifyUpdateInventoryMeta } from "@/integrations/shopify/actions/updateInventory.meta";
import { shopifyUpdateOrderStatusMeta } from "@/integrations/shopify/actions/updateOrderStatus.meta";
import { shopifyAddOrderNoteMeta } from "@/integrations/shopify/actions/addOrderNote.meta";
import { shopifyCreateFulfillmentMeta } from "@/integrations/shopify/actions/createFulfillment.meta";
import { shopifyUpdateProductVariantMeta } from "@/integrations/shopify/actions/updateProductVariant.meta";
import { UpdateProductConfigSchema } from "@/integrations/shopify/actions/updateProduct.schema";
import { CreateProductVariantConfigSchema } from "@/integrations/shopify/actions/createProductVariant.schema";
import { UpdateInventoryConfigSchema } from "@/integrations/shopify/actions/updateInventory.schema";
import { UpdateOrderStatusConfigSchema } from "@/integrations/shopify/actions/updateOrderStatus.schema";
import { AddOrderNoteConfigSchema } from "@/integrations/shopify/actions/addOrderNote.schema";
import { CreateFulfillmentConfigSchema } from "@/integrations/shopify/actions/createFulfillment.schema";
import { UpdateProductVariantConfigSchema } from "@/integrations/shopify/actions/updateProductVariant.schema";
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

describe("shopify update_inventory ids — RESOLVERS-2", () => {
  it("location_id is now a shopify:locations combobox (read_locations added as an OPTIONAL scope)", () => {
    // Supersedes the RESOLVERS-1 skip: the scope the locations list needs is
    // now requested (optional — see manifest.test.ts), so the field is a real
    // picker. Manual entry stays on for pasted ids / {{...}} mapping, and for
    // tokens that predate the scope (the resolver tells them to reconnect).
    const f = field(shopifyUpdateInventoryMeta, "location_id");
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("shopify:locations");
    expect(f.allowManualEntry).toBe(true);
    expect(f.required).toBe(true);
    expect(f.dependsOn).toBeUndefined();
  });

  it("inventory_item_id stays free text — a justified upstream-mapping field", () => {
    // An inventory item has no merchant-facing name/identity and Shopify has
    // no standalone list endpoint for it (/inventory_items.json requires an
    // `ids=` filter). The real path is mapping {{step.inventoryItemId}} from
    // an upstream variant step. A picker here could only show the parent
    // variant's label — i.e. a different id wearing the variant's name.
    const f = field(shopifyUpdateInventoryMeta, "inventory_item_id");
    expect(f.type).toBe("text");
    expect(f.optionsSource).toBeUndefined();
    expect(f.required).toBe(true);
    expect(f.description).toMatch(/inventoryItemId/);
  });

  it("both ids still round-trip as strings through the runtime schema", () => {
    expect(() =>
      UpdateInventoryConfigSchema.parse({
        inventory_item_id: "808950810",
        location_id: "905684977",
        adjustment_type: "set",
        quantity: 5,
      }),
    ).not.toThrow();
  });
});

describe("shopify order_id fields — shopify:orders combobox + manual entry", () => {
  it.each([
    [shopifyUpdateOrderStatusMeta.key, shopifyUpdateOrderStatusMeta],
    [shopifyAddOrderNoteMeta.key, shopifyAddOrderNoteMeta],
    [shopifyCreateFulfillmentMeta.key, shopifyCreateFulfillmentMeta],
  ] as const)("%s.order_id is a shopify:orders combobox", (_key, meta) => {
    const f = field(meta, "order_id");
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("shopify:orders");
    expect(f.allowManualEntry).toBe(true);
    expect(f.required).toBe(true);
    expect(f.dependsOn).toBeUndefined();
    expect(f.options).toBeUndefined();
    // No longer tells the user to go find an id by hand.
    expect(f.description).toMatch(/earlier step/i);
  });

  it("the combobox's string value round-trips through the order runtime schemas", () => {
    expect(() =>
      UpdateOrderStatusConfigSchema.parse({
        action: "add_note",
        order_id: "450789469",
        notify_customer: false,
        note: "hi",
      }),
    ).not.toThrow();
    expect(() =>
      AddOrderNoteConfigSchema.parse({
        order_id: "450789469",
        note: "hi",
        append: true,
      }),
    ).not.toThrow();
    expect(() =>
      CreateFulfillmentConfigSchema.parse({
        order_id: "450789469",
        notify_customer: false,
      }),
    ).not.toThrow();
  });
});

describe("shopify update_product_variant.variant_id — flat shopify:variants combobox", () => {
  it("is a shopify:variants combobox with NO dependsOn", () => {
    // Deliberate: the runtime schema has no sibling product field, and adding
    // one purely to shape the UI is out of scope. The resolver compensates
    // with product-qualified labels ("Acme Tee - Small / Blue - SKU …").
    const f = field(shopifyUpdateProductVariantMeta, "variant_id");
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("shopify:variants");
    expect(f.allowManualEntry).toBe(true);
    expect(f.required).toBe(true);
    expect(f.dependsOn).toBeUndefined();
  });

  it("the combobox's string value round-trips through the runtime schema", () => {
    expect(() =>
      UpdateProductVariantConfigSchema.parse({
        variant_id: "808950810",
        price: "44.99",
      }),
    ).not.toThrow();
  });
});
