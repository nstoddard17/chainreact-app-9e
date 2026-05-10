import { z } from "zod";

/**
 * `get_contacts` action schema — Slice 13 Batch 1.
 *
 * Returns a page of contacts via HubSpot's
 * `/crm/v3/objects/contacts/search` endpoint. Supports cursor
 * pagination via `after`.
 *
 * V1 [`getContacts.ts:38-43`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/hubspot/getContacts.ts#L38)
 * posts a TOP-LEVEL `filters` array which HubSpot ignores (the
 * documented shape is `filterGroups: [{ filters: [...] }]`). V2 fixes
 * this during the port — the wrapper builds the correct nested shape.
 *
 * Default properties (when omitted): `firstname`, `lastname`, `email`,
 * `phone`, `company`. Mirrors V1's default set.
 */
export const GetContactsConfigSchema = z
  .object({
    /** Max 100 per HubSpot's docs. Wrapper clamps. */
    limit: z.number().int().positive().max(100).optional(),
    /** Cursor from a prior response's `nextCursor`. */
    after: z.string().min(1).optional(),
    /**
     * Property names to return. Comma-separated string OR array.
     * Falls back to a sensible default set when omitted.
     */
    properties: z
      .union([z.array(z.string().min(1)), z.string().min(1)])
      .optional(),
    /**
     * Optional single-property EQ filter. Both fields must be present
     * to apply (matches V1's `if (filterProperty && filterValue)`
     * gate).
     */
    filterProperty: z.string().min(1).optional(),
    filterValue: z.string().min(1).optional(),
  })
  .strict();

export type GetContactsConfig = z.infer<typeof GetContactsConfigSchema>;
