import { z } from "zod";

/**
 * `create_order` action schema (Slice 12 Commit 3).
 *
 * V1 reference: [`lib/workflows/actions/shopify/createOrder.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createOrder.ts).
 *
 * Q11 — `send_receipt` is REQUIRED with NO default. V1's manifest
 * defaulted to `true` ([V1 shopify/index.ts:477](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts#L477)) — silently
 * emailing the customer on order creation. Fix during port: the
 * workflow author MUST explicitly choose true / false.
 *
 * `line_items` is non-empty (Shopify rejects empty orders). Each item
 * carries `variant_id` (numeric, sourced from a Product Variant) and
 * `quantity`.
 *
 * Address objects — both shipping + billing optional. When supplied,
 * the wrapper passes through to Shopify's REST address shape
 * (`address1` / `city` / `province` / `country_code` / `zip`).
 * Country is given as ISO 3166-1 alpha-2 ("US", "CA", "GB"); a
 * separate name-to-code helper is OUT of scope for Slice 12 Batch 1
 * (V1 has it; V2 keeps schema strict and surfaces the Shopify error
 * if the workflow passes a country name).
 */

const Address = z
  .object({
    address1: z.string().min(1).optional(),
    address2: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    province: z.string().min(1).optional(),
    /** ISO 3166-1 alpha-2 ("US", "CA", "GB"). */
    country_code: z
      .string()
      .regex(/^[A-Z]{2}$/, "country_code must be ISO 3166-1 alpha-2 (e.g. 'US')")
      .optional(),
    zip: z.string().min(1).optional(),
  })
  .strict();

export const CreateOrderConfigSchema = z
  .object({
    email: z.string().email(),
    line_items: z
      .array(
        z
          .object({
            variant_id: z.number().int().positive(),
            quantity: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1),
    /**
     * Q11 consent gate — required. Maps to Shopify's `send_receipt`
     * REST field directly.
     */
    send_receipt: z.boolean(),
    financial_status: z
      .enum(["pending", "authorized", "paid", "partially_paid", "refunded", "voided"])
      .optional(),
    note: z.string().min(1).optional(),
    tags: z.string().min(1).optional(),
    shipping_address: Address.optional(),
    billing_address: Address.optional(),
  })
  .strict();

export type CreateOrderConfig = z.infer<typeof CreateOrderConfigSchema>;
