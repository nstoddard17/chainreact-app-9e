import { z } from "zod";

/**
 * `get_products` action schema — HubSpot 2.1.
 *
 * Returns a page of products via
 * `POST /crm/v3/objects/products/search`. Mirrors `get_contacts` and
 * `get_line_items` schemas — cursor pagination via `after`, optional
 * EQ filter via `filterProperty` + `filterValue`, property projection
 * via `properties` (comma-separated string OR array).
 *
 * Default properties (when omitted): `name`, `description`, `price`,
 * `hs_sku`. Mirrors V1's default set.
 *
 * `.strict()` rejects V1 chrome at parse time.
 */
export const GetProductsConfigSchema = z
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

export type GetProductsConfig = z.infer<typeof GetProductsConfigSchema>;
