import { z } from "zod";

/**
 * Resolved-config schema for the Notion query_database action.
 *
 * `databaseId` is required.
 *
 * `filter` is forward-passed verbatim to Notion's API — V2 trusts the
 * user's filter object and lets Notion validate it (Slice 9 plan
 * §"V1 patterns to skip" — V1's advancedQuery builder is intentionally
 * skipped). Same for `sorts`.
 *
 * `pageSize` capped at 100 (Notion's hard ceiling).
 */
export const QueryDatabaseConfigSchema = z
  .object({
    databaseId: z.string().min(1, "databaseId is required."),
    filter: z.record(z.unknown()).optional(),
    sorts: z.array(z.record(z.unknown())).optional(),
    pageSize: z.number().int().positive().max(100).optional(),
    startCursor: z.string().optional(),
  })
  .strict();

export type QueryDatabaseConfig = z.infer<typeof QueryDatabaseConfigSchema>;
