import { z } from "zod";

/**
 * `create_product_variant` action schema (Slice 12 Commit 3).
 *
 * V1 reference: [`lib/workflows/actions/shopify/createProductVariant.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createProductVariant.ts).
 *
 * `option1` / `option2` / `option3` are optional values matched
 * against the parent product's option positions (e.g. if the
 * product's first option is "Size", `option1: "Large"`).
 *
 * No Q11 gate.
 */
export const CreateProductVariantConfigSchema = z
  .object({
    product_id: z.union([z.string().min(1), z.number().int().positive()]),
    /** Decimal-as-string price ("39.99"). */
    price: z.string().min(1),
    option1: z.string().min(1).optional(),
    option2: z.string().min(1).optional(),
    option3: z.string().min(1).optional(),
    sku: z.string().min(1).optional(),
    inventory_quantity: z.number().int().min(0).optional(),
    /** Weight in the shop's default unit. */
    weight: z.number().nonnegative().optional(),
    barcode: z.string().min(1).optional(),
  })
  .strict();

export type CreateProductVariantConfig = z.infer<
  typeof CreateProductVariantConfigSchema
>;
