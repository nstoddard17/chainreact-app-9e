import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { recordsList } from "../api/records";
import { FindRecordConfigSchema } from "./findRecord.schema";

/**
 * Airtable `find_record` action handler.
 *
 * Fetches at most one record matching `filterByFormula`. Returns
 * `{ found: false, record: null }` when there's no match — does NOT
 * throw NotFoundError. "Find" semantically allows zero results
 * (matches the V1 / Notion findFirst pattern + the Slice 10 plan
 * §"In-scope action list" #3).
 *
 * Output shape (downstream variable refs):
 *   { found: boolean, record: { id, fields, createdTime } | null }
 *   - Workflows can branch on `{{nodeId.found}}` and access the
 *     match via `{{nodeId.record.fields.<FieldName>}}`.
 */
export const findRecord: ActionHandler = async (input) => {
  const config = FindRecordConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "airtable"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "airtable",
    accountId,
    apiCall: (accessToken) =>
      recordsList({
        accessToken,
        baseId: config.baseId,
        tableIdOrName: config.tableIdOrName,
        filterByFormula: config.filterByFormula,
        maxRecords: 1,
      }),
  });

  const first = result.records[0];
  if (!first) {
    return {
      output: {
        found: false,
        record: null,
      },
    };
  }
  return {
    output: {
      found: true,
      record: {
        id: first.id,
        fields: first.fields,
        createdTime: first.createdTime ?? null,
      },
    },
  };
};
