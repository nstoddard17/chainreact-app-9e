import { z } from "zod";
import { TypedFieldInputSchema } from "./_fieldInput.schema";

/**
 * Resolved-config schema for the Airtable `update_record` action.
 *
 * Q11 — explicit fields, no hidden defaults:
 *   - `baseId`, `tableIdOrName`, `recordId` required.
 *   - `fields` is the typed map. Only the fields present here are
 *     updated; others are preserved (PATCH semantics).
 *   - `typecast` REQUIRED — same Q11 rationale as create_record.
 *
 * Strict mode catches typos.
 */
export const UpdateRecordConfigSchema = z
  .object({
    baseId: z.string().min(1),
    tableIdOrName: z.string().min(1),
    recordId: z.string().min(1),
    fields: z.record(z.string(), TypedFieldInputSchema),
    typecast: z.boolean(),
  })
  .strict();

export type UpdateRecordConfig = z.infer<typeof UpdateRecordConfigSchema>;
