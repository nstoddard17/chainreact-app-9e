import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { valuesAppend } from "../api/valuesAppend";
import {
  AppendRowConfigSchema,
  type AppendRowConfig,
} from "./appendRow.schema";

/**
 * Google Sheets `spreadsheets.values.append` action handler.
 *
 * Wraps the principal API call in `refreshAndRetry` (Q3). The schema's
 * required `valueInputOption` (Q11) is forwarded verbatim — the wrapper
 * trusts the schema's choice rather than re-coercing.
 *
 * Output surfaces the response's `updates.*` fields directly so
 * downstream variable references like `{{appendNode.updatedRange}}` work
 * naturally. `tableRange` (the range Google detected as the existing
 * table) is also surfaced for debugging.
 */
export const appendRow: ActionHandler = async (input) => {
  const config: AppendRowConfig = AppendRowConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-sheets"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-sheets",
    providerAccountId,
    apiCall: (accessToken) =>
      valuesAppend({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        range: config.range,
        valueInputOption: config.valueInputOption,
        insertDataOption: config.insertDataOption,
        // Single row, wrapped in the array-of-rows shape Sheets expects.
        values: [config.values],
      }),
  });

  const updates = result.updates ?? {};

  return {
    output: {
      spreadsheetId: result.spreadsheetId ?? config.spreadsheetId,
      tableRange: result.tableRange ?? null,
      updatedRange: updates.updatedRange ?? null,
      updatedRows: updates.updatedRows ?? 0,
      updatedColumns: updates.updatedColumns ?? 0,
      updatedCells: updates.updatedCells ?? 0,
    },
  };
};
