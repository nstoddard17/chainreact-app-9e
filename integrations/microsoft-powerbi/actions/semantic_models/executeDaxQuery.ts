import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { executeQueries } from "../../api/datasets/executeQueries";
import { ExecuteDaxQueryConfigSchema } from "./executeDaxQuery.schema";

/**
 * Power BI `execute_dax_query` action handler.
 *
 * Runs ONE DAX query against a semantic model and returns the first
 * result table's rows, truncated client-side to `maxRows` (Power BI
 * itself allows up to 100k rows / 15 MB per query — far beyond what a
 * workflow variable should carry). Requires dataset Build permission and
 * the "Dataset Execute Queries REST API" tenant setting.
 *
 * Output shape (downstream variable refs):
 *   { rows, rowCount, truncated }
 */
export const executeDaxQuery: ActionHandler = async (input) => {
  const config = ExecuteDaxQueryConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      executeQueries({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
        daxQuery: config.daxQuery,
        includeNulls: config.includeNulls,
        impersonatedUserName: config.impersonatedUserName,
      }),
  });

  const truncated = result.rows.length > config.maxRows;
  const rows = truncated ? result.rows.slice(0, config.maxRows) : result.rows;

  return {
    output: {
      rows,
      rowCount: rows.length,
      truncated,
    },
  };
};
