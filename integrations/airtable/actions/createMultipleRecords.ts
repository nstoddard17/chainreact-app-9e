import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  formatFields,
  type TypedFieldInput,
} from "@/integrations/_shared/airtable/fields";
import { recordsBatchCreate } from "../api/records";
import { CreateMultipleRecordsConfigSchema } from "./createMultipleRecords.schema";

/**
 * Airtable `create_multiple_records` action handler — Airtable 2.1
 * Commit 3.
 *
 * Uses Airtable's TRUE batch create wire-format
 * (`POST /v0/{baseId}/{tableIdOrName}` with `records: [{fields}]`,
 * max 10) — exactly ONE HTTP request per call. V1's
 * `createMultipleRecords.ts` did a sequential single-record loop +
 * silently capped at 10 + supported `continueOnError` partial-success
 * envelopes — NONE OF THAT is ported per the accepted audit:
 *   - parity-airtable A-R11 — sequential loop NOT PORTED.
 *   - parity-airtable A-R12 — silent Math.min cap NOT PORTED (schema
 *     fails loud at >10).
 *   - parity-airtable A-R13 — continueOnError partial success NOT
 *     PORTED. Per NPD-A1: all-or-nothing.
 *
 * Field formatter:
 *   Each record's typed-field map flows through the shared
 *   `formatFields` helper — same path as `create_record` and
 *   `update_record`. Attachment fields (promoted in Airtable 2.1
 *   Commit 1) write through the formatter's attachment case. Deferred
 *   types throw `UnsupportedFieldTypeError` BEFORE the wrapper call.
 *
 * Output shape (bounded — no raw Airtable response spread):
 *   {
 *     baseId, tableIdOrName,
 *     createdCount: number,
 *     records: [{ id, fields, createdTime }, ...]
 *   }
 *   `fields` is the Airtable server's echo (may differ from input
 *   when typecast=true coerces). `createdTime` is null when Airtable
 *   omits it (defensive — Airtable always returns it).
 */
export const createMultipleRecords: ActionHandler = async (input) => {
  const config = CreateMultipleRecordsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "airtable"
      ? input.triggerEvent.providerAccountId
      : null;

  // Coerce every record's typed field map into wire-format. Throws
  // UnsupportedFieldTypeError on the first deferred type — no wrapper
  // call happens, no partial state to roll back.
  const wireRecords = config.records.map((r) => ({
    fields: formatFields(
      r.fields as Readonly<Record<string, TypedFieldInput>>,
    ),
  }));

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "airtable",
    providerAccountId,
    apiCall: (accessToken) =>
      recordsBatchCreate({
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
      createdCount: result.records.length,
      records: result.records.map((r) => ({
        id: r.id,
        fields: r.fields,
        createdTime: r.createdTime ?? null,
      })),
    },
  };
};
