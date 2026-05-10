import { z } from "zod";

/**
 * `create_line_item` action schema — Slice 13 Batch 2.
 *
 * Required: `dealId` + either `hs_product_id` (link to existing
 * product) OR `name` (free-form line item — HubSpot allows). The
 * handler enforces "at least one of (hs_product_id, name)" since Zod
 * doesn't have a clean built-in `oneOf` for this case (a refine could
 * but a handler-side check stays readable).
 *
 * `quantity` is a string per HubSpot's wire format (server coerces);
 * required by V1.
 *
 * Slice 13 Batch 2 always associates the line item to the supplied
 * `dealId` via the v4 default-typed association (line_item → deal,
 * type 20). A failed association doesn't roll back the line item;
 * surfaced as `associationWarnings`.
 */
export const CreateLineItemConfigSchema = z
  .object({
    dealId: z.string().min(1),
    hs_product_id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    quantity: z.string().min(1),
    price: z.string().min(1).optional(),
    discount: z.string().min(1).optional(),
  })
  .strict();

export type CreateLineItemConfig = z.infer<typeof CreateLineItemConfigSchema>;
