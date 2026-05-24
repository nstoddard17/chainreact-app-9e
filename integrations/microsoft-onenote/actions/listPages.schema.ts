import { z } from "zod";

/**
 * Resolved-config schema for the OneNote `list_pages` action —
 * Slice 3.ONENOTE-2.
 *
 * V1-preserved camelCase field names: `sectionId`, `orderBy`, `top`.
 *
 * **V1's raw OData `filter` field is intentionally NOT exposed**
 * per ONENOTE-1 §4.1 D-defer (OData strings are footgun-prone
 * without schema-level validation; a future structured filter set —
 * date-range / title-contains — ships when real consumers ask).
 * The schema rejects `filter` via strict mode.
 *
 * Defaults preserved from V1:
 *   - `orderBy` defaults to `"lastModifiedDateTime desc"` (V1
 *     default).
 *   - `top` defaults to 20 (V1 default; Graph caps at 100 for
 *     OneNote pages).
 */
export const ListPagesConfigSchema = z
  .object({
    sectionId: z
      .string({ required_error: "sectionId is required." })
      .min(1, "sectionId is required."),
    orderBy: z
      .enum([
        "lastModifiedDateTime desc",
        "lastModifiedDateTime asc",
        "createdDateTime desc",
        "createdDateTime asc",
        "title asc",
        "title desc",
      ])
      .default("lastModifiedDateTime desc"),
    top: z.number().int().min(1).max(100).default(20),
  })
  .strict();

export type ListPagesConfig = z.infer<typeof ListPagesConfigSchema>;
