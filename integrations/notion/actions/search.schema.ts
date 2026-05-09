import { z } from "zod";

/**
 * Resolved-config schema for the Notion search action.
 *
 * `query` is required; empty string means "all accessible objects."
 *
 * `filter` is the discriminated `{ value, property: "object" }` shape
 * Notion expects — only `page` and `database` are valid `value`s in
 * the current API. The schema enforces both constraints.
 *
 * `pageSize` capped at 100 (Notion's hard ceiling).
 */
export const SearchConfigSchema = z
  .object({
    query: z.string(),
    filter: z
      .object({
        value: z.enum(["page", "database"]),
        property: z.literal("object"),
      })
      .optional(),
    pageSize: z.number().int().positive().max(100).optional(),
    startCursor: z.string().optional(),
  })
  .strict();

export type SearchConfig = z.infer<typeof SearchConfigSchema>;
