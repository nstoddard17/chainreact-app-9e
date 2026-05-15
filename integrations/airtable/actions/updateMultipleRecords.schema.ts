import { z } from "zod";
import { TypedFieldInputSchema } from "./_fieldInput.schema";

/**
 * Resolved-config schema for the Airtable `update_multiple_records`
 * action — Airtable 2.1 Commit 4.
 *
 * Airtable's batch update endpoint accepts **1..10 records per
 * request**. V2 enforces the cap at parse time (Q11 — fail loud).
 * V1's `updateMultipleRecords.ts` used a sequential single-record loop
 * with no explicit batch cap — NOT PORTED per parity-airtable A-R11.
 *
 * Each record requires an explicit `recordId`. There's no upsert path
 * here — workflow authors who don't have ids must fetch them via
 * `list_records` / `find_record` first.
 *
 * Failure mode (NPD-A1 — Airtable 2.1):
 *   - Airtable returns 422 if any record fails validation (or one of
 *     the ids doesn't exist). V2 propagates the error verbatim; there
 *     is no per-record retry, no partial-success envelope, no
 *     `continueOnError` config field.
 *
 * Each `records[].fields` is a typed map matching `update_record`'s
 * field shape — deferred field types are rejected at the
 * discriminated-union layer (defense in depth before the runtime
 * `UnsupportedFieldTypeError` throw). Attachment fields (promoted in
 * Airtable 2.1 Commit 1) parse cleanly here.
 *
 * `typecast` is explicit per Q11 — no silent default.
 */
export const UpdateMultipleRecordsConfigSchema = z
  .object({
    baseId: z.string().min(1),
    tableIdOrName: z.string().min(1),
    records: z
      .array(
        z
          .object({
            recordId: z.string().min(1, "recordId cannot be empty"),
            fields: z.record(z.string(), TypedFieldInputSchema),
          })
          .strict(),
      )
      .min(1, "records must contain at least 1 record")
      .max(10, "records cannot exceed 10 (Airtable batch update cap)"),
    typecast: z.boolean(),
  })
  .strict();

export type UpdateMultipleRecordsConfig = z.infer<
  typeof UpdateMultipleRecordsConfigSchema
>;
