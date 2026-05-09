import { z } from "zod";

/**
 * Resolved-config schema for the Airtable `get_base_schema` action.
 *
 * Q11 — `includeViews` is REQUIRED at the schema layer (no silent
 * default). The action-layer schema forces an explicit boolean
 * because `views` payloads can be sizable on bases with many tables;
 * silently including them would surprise workflows that expect a
 * lean response. Default in the UI layer is `false`.
 *
 * Strict mode catches typos.
 */
export const GetBaseSchemaConfigSchema = z
  .object({
    baseId: z.string().min(1),
    includeViews: z.boolean(),
  })
  .strict();

export type GetBaseSchemaConfig = z.infer<typeof GetBaseSchemaConfigSchema>;
