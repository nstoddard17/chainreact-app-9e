import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { recordsGet } from "../api/records";
import { GetRecordConfigSchema } from "./getRecord.schema";

/**
 * Airtable `get_record` action handler.
 *
 * Returns the raw record fields. Schema-aware parsing (typed
 * ParsedFieldValue map) is deferred — most field types are identity
 * passthroughs on read, so a workflow that writes typed values
 * receives them in the same shape (e.g., a number stays a number, a
 * string stays a string). Schema-aware parsing is exercised in the
 * record_changed trigger (Commit 4) where the field-type metadata
 * is available from the webhook activation context.
 *
 * Output shape:
 *   { id, fields, createdTime }
 *   Workflows drill via `{{nodeId.fields.<FieldName>}}`.
 */
export const getRecord: ActionHandler = async (input) => {
  const config = GetRecordConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "airtable"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "airtable",
    providerAccountId,
    apiCall: (accessToken) =>
      recordsGet({
        accessToken,
        baseId: config.baseId,
        tableIdOrName: config.tableIdOrName,
        recordId: config.recordId,
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
