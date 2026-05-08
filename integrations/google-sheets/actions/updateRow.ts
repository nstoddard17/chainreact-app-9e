import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { valuesUpdate } from "../api/valuesUpdate";
import {
  UpdateRowConfigSchema,
  type UpdateRowConfig,
} from "./updateRow.schema";

/**
 * Google Sheets `spreadsheets.values.update` action handler.
 *
 * Wraps the principal API call in `refreshAndRetry` (Q3). Q11 required
 * `valueInputOption` is forwarded verbatim from the schema.
 *
 * Output surfaces the response's update counters directly so downstream
 * references like `{{updateNode.updatedRange}}` work naturally.
 */
export const updateRow: ActionHandler = async (input) => {
  const config: UpdateRowConfig = UpdateRowConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "google-sheets"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "google-sheets",
    accountId,
    apiCall: (accessToken) =>
      valuesUpdate({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        range: config.range,
        valueInputOption: config.valueInputOption,
        // Single row, wrapped in the array-of-rows shape Sheets expects.
        values: [config.values],
      }),
  });

  return {
    output: {
      spreadsheetId: result.spreadsheetId ?? config.spreadsheetId,
      updatedRange: result.updatedRange ?? null,
      updatedRows: result.updatedRows ?? 0,
      updatedColumns: result.updatedColumns ?? 0,
      updatedCells: result.updatedCells ?? 0,
    },
  };
};
