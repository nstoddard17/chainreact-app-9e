import { z } from "zod";

/**
 * `remove_line_item` action schema — HubSpot 2.1.
 *
 * Deletes a HubSpot line item by id via
 * `DELETE /crm/v3/objects/line_items/{id}`.
 *
 * Replaying a DELETE against an already-deleted line item returns 404
 * which the shared wrapper surfaces as the canonical `NotFoundError` —
 * naturally idempotent on the provider side.
 *
 * No additional fields. `.strict()` rejects V1 chrome (`deleteBy`,
 * `confirmDelete`, `deletedData`) at parse time.
 */
export const RemoveLineItemConfigSchema = z
  .object({
    lineItemId: z.string().min(1, "lineItemId is required."),
  })
  .strict();

export type RemoveLineItemConfig = z.infer<typeof RemoveLineItemConfigSchema>;
