import { z } from "zod";

/**
 * Resolved-config schema for the Airtable `get_table_schema` action.
 *
 * Same Q11 pattern as `get_base_schema` — `includeViews` REQUIRED
 * (no silent default).
 *
 * Targets a known resource (a specific table by id or name); throws
 * `NotFoundError` when the table doesn't exist in the base.
 */
export const GetTableSchemaConfigSchema = z
  .object({
    baseId: z.string().min(1),
    tableIdOrName: z.string().min(1),
    includeViews: z.boolean(),
  })
  .strict();

export type GetTableSchemaConfig = z.infer<typeof GetTableSchemaConfigSchema>;
