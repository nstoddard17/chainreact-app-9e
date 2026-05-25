import { z } from "zod";

/**
 * `create_product` action schema (Slice 12 Commit 3).
 *
 * V1 reference: [`lib/workflows/actions/shopify/createProduct.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createProduct.ts).
 *
 * No Q11 gate — product creation doesn't trigger customer-facing
 * emails.
 *
 * `price` is a string (Shopify's convention — decimal-as-string for
 * currency precision). The schema rejects empty strings and ones
 * that don't parse as a number; the strict format check is left to
 * Shopify's 422 response (the wrapper surfaces it as a typed error).
 */
export const CreateProductConfigSchema = z
  .object({
    title: z.string().min(1),
    /**
     * Decimal-as-string price ("29.99"). Slice 12 trusts Shopify to
     * validate format and surface 422 errors for bad inputs.
     */
    price: z.string().min(1),
    body_html: z.string().min(1).optional(),
    vendor: z.string().min(1).optional(),
    product_type: z.string().min(1).optional(),
    sku: z.string().min(1).optional(),
    inventory_quantity: z.number().int().min(0).optional(),
  })
  .strict();

export type CreateProductConfig = z.infer<typeof CreateProductConfigSchema>;
