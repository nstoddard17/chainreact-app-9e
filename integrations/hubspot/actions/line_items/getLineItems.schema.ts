import { z } from "zod";

/**
 * `get_line_items` action schema — HubSpot 2.1.
 *
 * Returns a page of line items via
 * `POST /crm/v3/objects/line_items/search`. Mirrors `get_contacts` /
 * `get_companies` / `get_deals` schemas — cursor pagination via
 * `after`, optional EQ filter via `filterProperty` + `filterValue`,
 * property projection via `properties` (comma-separated string OR
 * array).
 *
 * Default properties (when omitted): `name`, `hs_product_id`,
 * `quantity`, `price`, `amount`. Mirrors V1's default set.
 *
 * `.strict()` rejects V1 chrome (`hasHeaders`, `skipEmptyRows`,
 * `requiredColumns`, etc.) at parse time.
 */
export const GetLineItemsConfigSchema = z
  .object({
    /** Max 100 per HubSpot's docs. */
    limit: z.number().int().positive().max(100).optional(),
    /** Cursor from a prior response's `nextCursor`. */
    after: z.string().min(1).optional(),
    /** Property names to return. Comma-separated string OR array. */
    properties: z
      .union([z.array(z.string().min(1)), z.string().min(1)])
      .optional(),
    /** Optional single-property EQ filter. Both must be present to apply. */
    filterProperty: z.string().min(1).optional(),
    filterValue: z.string().min(1).optional(),
  })
  .strict();

export type GetLineItemsConfig = z.infer<typeof GetLineItemsConfigSchema>;
