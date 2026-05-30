import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  formatFields,
  type TypedFieldInput,
} from "@/integrations/_shared/airtable/fields";
import { recordsUpdate } from "../api/records";
import { UpdateRecordConfigSchema } from "./updateRecord.schema";

/**
 * Airtable `update_record` action handler.
 *
 * PATCH semantics: only the fields explicitly present in
 * `config.fields` are updated; others are preserved. Workflow
 * authors who want to clear a field pass `null` as the value (the
 * Zod schema permits null for nullable types).
 *
 * 404 from Airtable surfaces as `NotFoundError` — handlers don't
 * catch this; the engine surfaces it to error_classification as a
 * config error.
 *
 * `typecast` is explicit per Q11 — no silent default.
 *
 * Output shape:
 *   { id, fields, createdTime }
 */
export const updateRecord: ActionHandler = async (input) => {
  const config = UpdateRecordConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "airtable"
      ? input.triggerEvent.providerAccountId
      : null;

  const wireFields = formatFields(
    config.fields as Readonly<Record<string, TypedFieldInput>>,
  );

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "airtable",
    providerAccountId,
    apiCall: (accessToken) =>
      recordsUpdate({
        accessToken,
        baseId: config.baseId,
        tableIdOrName: config.tableIdOrName,
        recordId: config.recordId,
        fields: wireFields,
        typecast: config.typecast,
      }),
  });

  return {
    output: {
      id: result.id,
      fields: result.fields,
      createdTime: result.createdTime ?? null,
    },
  };
};
