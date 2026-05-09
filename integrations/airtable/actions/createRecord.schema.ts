import { z } from "zod";
import { TypedFieldInputSchema } from "./_fieldInput.schema";

/**
 * Resolved-config schema for the Airtable `create_record` action.
 *
 * Q11 — explicit fields, no hidden defaults:
 *   - `baseId` and `tableIdOrName` required.
 *   - `fields` is a typed map keyed by Airtable field name. Each
 *     value declares its own `type` discriminator + `value`.
 *     Deferred field types (attachment / formula / lookup / etc.)
 *     fail Zod's discriminated-union validation here with a clear
 *     mismatch error.
 *   - `typecast` is REQUIRED — no silent default. Workflow authors
 *     who want Airtable to coerce strings → enum values must opt in.
 *     Default in the UI layer is `false` (safe), but the schema
 *     forces the action handler to receive an explicit boolean.
 *
 * Strict mode catches typos in keys.
 */
export const CreateRecordConfigSchema = z
  .object({
    baseId: z.string().min(1),
    tableIdOrName: z.string().min(1),
    fields: z.record(z.string(), TypedFieldInputSchema),
    typecast: z.boolean(),
  })
  .strict();

export type CreateRecordConfig = z.infer<typeof CreateRecordConfigSchema>;
