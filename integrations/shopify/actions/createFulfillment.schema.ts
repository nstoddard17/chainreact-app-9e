import { z } from "zod";

/**
 * `create_fulfillment` action schema (Slice 12 Commit 3).
 *
 * V1 reference: [`lib/workflows/actions/shopify/createFulfillment.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/createFulfillment.ts).
 *
 * Q11 — `notify_customer` REQUIRED with NO default. V1 defaulted to
 * `true` ([V1 shopify/index.ts:1693](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts#L1693)) — silently
 * sending shipping-confirmation emails. Fix during port.
 *
 * Tracking fields are all optional but Shopify groups them into a
 * single `tracking_info` object on the wire — the wrapper only
 * includes `tracking_info` when at least one tracking field is set.
 */
export const CreateFulfillmentConfigSchema = z
  .object({
    order_id: z.union([z.string().min(1), z.number().int().positive()]),
    /** Q11 consent gate — required. */
    notify_customer: z.boolean(),
    tracking_number: z.string().min(1).optional(),
    tracking_company: z.string().min(1).optional(),
    tracking_url: z.string().url().optional(),
  })
  .strict();

export type CreateFulfillmentConfig = z.infer<
  typeof CreateFulfillmentConfigSchema
>;
