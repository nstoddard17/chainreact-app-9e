import { z } from "zod";

/**
 * `update_product` action schema (Slice 12 Commit 3).
 *
 * V1 reference: [`lib/workflows/actions/shopify/updateProduct.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateProduct.ts).
 *
 * All update fields optional — Shopify's PUT accepts a partial
 * product body. The wrapper drops undefined fields so empty strings
 * don't accidentally clear values.
 *
 * `published` is a boolean at the schema layer; the wrapper maps to
 * Shopify's `status: "active" | "draft"` REST field. V1's
 * "Keep Current" select-field shape is dropped — Slice 12 keeps the
 * binary, and "no change" is expressed by omitting the field
 * entirely.
 */
export const UpdateProductConfigSchema = z
  .object({
    product_id: z.union([z.string().min(1), z.number().int().positive()]),
    title: z.string().min(1).optional(),
    body_html: z.string().min(1).optional(),
    vendor: z.string().min(1).optional(),
    product_type: z.string().min(1).optional(),
    tags: z.string().min(1).optional(),
    published: z.boolean().optional(),
  })
  .strict();

export type UpdateProductConfig = z.infer<typeof UpdateProductConfigSchema>;
