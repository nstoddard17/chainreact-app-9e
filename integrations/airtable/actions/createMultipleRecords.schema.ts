import { z } from "zod";
import { TypedFieldInputSchema } from "./_fieldInput.schema";

/**
 * Resolved-config schema for the Airtable `create_multiple_records`
 * action — Airtable 2.1 Commit 3.
 *
 * Airtable's batch create endpoint accepts **1..10 records per
 * request**. V2 enforces the cap at parse time (Q11 — fail loud).
 * V1's `createMultipleRecords.ts` silently truncated via
 * `Math.min(Number(config.maxRecords) || 10, 10)` — NOT PORTED per
 * parity-airtable A-R12.
 *
 * Failure mode (NPD-A1 — Airtable 2.1):
 *   - Airtable returns 422 if any record fails validation. V2
 *     propagates the error verbatim; there is no per-record retry,
 *     no partial-success envelope, no `continueOnError` config field.
 *
 * Each `records[].fields` is a typed map matching `create_record`'s
 * field shape — deferred field types are rejected at the
 * discriminated-union layer (defense in depth before the runtime
 * `UnsupportedFieldTypeError` throw). Attachment fields (promoted in
 * Airtable 2.1 Commit 1) parse cleanly here.
 *
 * `typecast` is explicit per Q11 — no silent default.
 */
export const CreateMultipleRecordsConfigSchema = z
  .object({
    baseId: z.string().min(1),
    tableIdOrName: z.string().min(1),
    records: z
      .array(
        z
          .object({
            fields: z.record(z.string(), TypedFieldInputSchema),
          })
          .strict(),
      )
      .min(1, "records must contain at least 1 record")
      .max(10, "records cannot exceed 10 (Airtable batch create cap)"),
    typecast: z.boolean(),
  })
  .strict();

export type CreateMultipleRecordsConfig = z.infer<
  typeof CreateMultipleRecordsConfigSchema
>;
