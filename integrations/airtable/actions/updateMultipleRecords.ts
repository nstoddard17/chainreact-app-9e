import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  formatFields,
  type TypedFieldInput,
} from "@/integrations/_shared/airtable/fields";
import { recordsBatchUpdate } from "../api/records";
import { UpdateMultipleRecordsConfigSchema } from "./updateMultipleRecords.schema";

/**
 * Airtable `update_multiple_records` action handler — Airtable 2.1
 * Commit 4.
 *
 * Uses Airtable's TRUE batch update wire-format
 * (`PATCH /v0/{baseId}/{tableIdOrName}` with
 * `records: [{id, fields}]`, max 10) — exactly ONE HTTP request per
 * call. V1's `updateMultipleRecords.ts` did a sequential single-record
 * loop — NOT PORTED per parity-airtable A-R11.
 *
 * PATCH semantics per record: only the fields explicitly present on
 * each entry are updated; other fields on that record are preserved.
 *
 * Field formatter:
 *   Each record's typed-field map flows through the shared
 *   `formatFields` helper — same path as `update_record` and
 *   `create_multiple_records`. Attachment fields (promoted in Airtable
 *   2.1 Commit 1) write through the formatter's attachment case.
 *   Deferred types throw `UnsupportedFieldTypeError` BEFORE the wrapper
 *   call.
 *
 * All-or-nothing (NPD-A1):
 *   Airtable returns 422 if any record fails validation (including the
 *   case where one of the ids doesn't exist). The error propagates —
 *   no `continueOnError` partial-success envelope, no per-record retry,
 *   no `success: false` synthetic ActionResult wrapper.
 *
 * Output shape (bounded — no raw Airtable response spread):
 *   {
 *     baseId, tableIdOrName,
 *     updatedCount: number,
 *     records: [{ id, fields, createdTime }, ...]
 *   }
 *   `fields` is the Airtable server's echo (may differ from input when
 *   typecast=true coerces). `createdTime` is null when Airtable omits
 *   it (defensive — Airtable always returns it on the record body).
 */
export const updateMultipleRecords: ActionHandler = async (input) => {
  const config = UpdateMultipleRecordsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "airtable"
      ? input.triggerEvent.providerAccountId
      : null;

  // Coerce every record's typed field map into wire-format. Throws
  // UnsupportedFieldTypeError on the first deferred type — no wrapper
  // call happens, no partial state to roll back.
  const wireRecords = config.records.map((r) => ({
    id: r.recordId,
    fields: formatFields(
      r.fields as Readonly<Record<string, TypedFieldInput>>,
    ),
  }));

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "airtable",
    providerAccountId,
    apiCall: (accessToken) =>
      recordsBatchUpdate({
        accessToken,
        baseId: config.baseId,
        tableIdOrName: config.tableIdOrName,
        records: wireRecords,
        typecast: config.typecast,
      }),
  });

  return {
    output: {
      baseId: config.baseId,
      tableIdOrName: config.tableIdOrName,
      updatedCount: result.records.length,
      records: result.records.map((r) => ({
        id: r.id,
        fields: r.fields,
        createdTime: r.createdTime ?? null,
      })),
    },
  };
};
