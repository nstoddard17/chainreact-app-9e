import { z } from "zod";

/**
 * `update_product_variant` action schema — Shopify 2.1 Commit 1.
 *
 * The single net-new action ported from V1's surface per
 * [`docs/slices/parity-shopify.md`](../../../docs/slices/parity-shopify.md) §5.
 *
 * V1 reference: [`lib/workflows/actions/shopify/updateProductVariant.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateProductVariant.ts).
 * V1 used GraphQL `productVariantsBulkUpdate` for single-record use and
 * explicitly noted that "Inventory quantity requires a separate
 * mutation" + "Weight updates are not supported via
 * productVariantsBulkUpdate". V2's REST endpoint
 * (`PUT /admin/api/2024-10/variants/{id}.json`) supports the full
 * documented variant field set — the broader V2 surface is intentional.
 *
 * **Inventory boundary (NPD-S5 / per audit + Marcus's accepted scope):**
 * inventory fields (`inventory_quantity`, `inventory_item_id`,
 * `inventory_management`) are EXCLUDED from this schema. Variant
 * inventory updates flow through the dedicated `update_inventory`
 * action (Slice 12 Commit 3). The `.strict()` modifier rejects any
 * attempt to pass these fields here.
 *
 * **At least one update field required.** Sending a `variant_id`-only
 * config is rejected at the schema layer — Shopify would silently
 * accept it (no-op PUT) and the workflow author would have a confusing
 * silent success. The `.refine` enforces "at least one mutable field
 * supplied" before the wrapper call.
 *
 * `weight_unit` is a typed enum — Shopify accepts exactly four values
 * (`g`, `kg`, `oz`, `lb`); silently passing arbitrary strings would
 * make Shopify return an `invalid weight_unit` error mid-PUT.
 */

const WeightUnitSchema = z.enum(["g", "kg", "oz", "lb"]);

const MUTABLE_FIELDS = [
  "price",
  "compare_at_price",
  "sku",
  "barcode",
  "option1",
  "option2",
  "option3",
  "weight",
  "weight_unit",
  "taxable",
] as const;

export const UpdateProductVariantConfigSchema = z
  .object({
    variant_id: z.union([
      z.string().min(1, "variant_id cannot be empty"),
      z.number().int().positive(),
    ]),
    /** Decimal-as-string price ("44.99"). */
    price: z.string().min(1).optional(),
    /** Decimal-as-string compare-at price ("59.99"); display only. */
    compare_at_price: z.string().min(1).optional(),
    sku: z.string().min(1).optional(),
    barcode: z.string().min(1).optional(),
    option1: z.string().min(1).optional(),
    option2: z.string().min(1).optional(),
    option3: z.string().min(1).optional(),
    /** Weight value in `weight_unit` units. */
    weight: z.number().nonnegative().optional(),
    /** Shopify-supported weight units only. */
    weight_unit: WeightUnitSchema.optional(),
    /** Whether the variant is taxable. */
    taxable: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      MUTABLE_FIELDS.some(
        (key) => (data as Record<string, unknown>)[key] !== undefined,
      ),
    {
      message:
        "update_product_variant requires at least one mutable field (price, compare_at_price, sku, barcode, option1-3, weight, weight_unit, or taxable). variant_id alone is rejected.",
    },
  );

export type UpdateProductVariantConfig = z.infer<
  typeof UpdateProductVariantConfigSchema
>;
