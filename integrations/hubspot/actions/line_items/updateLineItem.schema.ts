import { z } from "zod";

/**
 * `update_line_item` action schema — Slice 13 Batch 2.
 *
 * Required: `lineItemId`. At least one property field must be present
 * (handler enforces). No association re-binding — relinking a line
 * item to a different deal is a separate flow.
 */
export const UpdateLineItemConfigSchema = z
  .object({
    lineItemId: z.string().min(1),
    name: z.string().min(1).optional(),
    quantity: z.string().min(1).optional(),
    price: z.string().min(1).optional(),
    discount: z.string().min(1).optional(),
  })
  .strict();

export type UpdateLineItemConfig = z.infer<typeof UpdateLineItemConfigSchema>;
