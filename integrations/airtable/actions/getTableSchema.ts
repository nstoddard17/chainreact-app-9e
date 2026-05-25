import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { tablesGet } from "../api/tables";
import { GetTableSchemaConfigSchema } from "./getTableSchema.schema";

/**
 * Airtable `get_table_schema` action handler.
 *
 * Fetches the full base schema (Airtable doesn't expose a per-table
 * metadata endpoint) and filters client-side to the requested table.
 * Throws `NotFoundError` when the table id/name doesn't match any
 * table in the base.
 *
 * Output shape:
 *   { baseId, table: { id, name, primaryFieldId, fields, views? },
 *     fieldCount }
 */
export const getTableSchema: ActionHandler = async (input) => {
  const config = GetTableSchemaConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "airtable"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "airtable",
    accountId,
    apiCall: (accessToken) =>
      tablesGet({
        accessToken,
        baseId: config.baseId,
        tableIdOrName: config.tableIdOrName,
        includeViews: config.includeViews,
      }),
  });

  return {
    output: {
      baseId: config.baseId,
      table: result,
      fieldCount: result.fields.length,
    },
  };
};
