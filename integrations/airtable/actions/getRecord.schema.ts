import { z } from "zod";

/**
 * Resolved-config schema for the Airtable `get_record` action.
 *
 * Targets a known resource — throws `NotFoundError` on 404 (caught
 * by the engine and classified as a config error). Distinct from
 * `find_record`, which returns `null` on no match.
 */
export const GetRecordConfigSchema = z
  .object({
    baseId: z.string().min(1),
    tableIdOrName: z.string().min(1),
    recordId: z.string().min(1),
  })
  .strict();

export type GetRecordConfig = z.infer<typeof GetRecordConfigSchema>;
