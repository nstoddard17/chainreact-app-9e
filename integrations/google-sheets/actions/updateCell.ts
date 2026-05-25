import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { valuesUpdate } from "../api/valuesUpdate";
import {
  UpdateCellConfigSchema,
  type UpdateCellConfig,
} from "./updateCell.schema";

/**
 * Google Sheets `spreadsheets.values.update` single-cell action handler
 * (Sheets 2.1 Commit 1).
 *
 * Writes a single cell. Wraps the principal API call in `refreshAndRetry`
 * (Q3); Q11 required `valueInputOption` is forwarded verbatim from the
 * schema. The single value is wrapped in `[[value]]` for the
 * array-of-rows shape Sheets expects.
 *
 * Output mirrors the response counters so downstream nodes can branch on
 * `{{updateNode.updated}}` or read the canonical `updatedRange` from the
 * Sheets response.
 */
export const updateCell: ActionHandler = async (input) => {
  const config: UpdateCellConfig = UpdateCellConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "google-sheets"
      ? input.triggerEvent.accountId
      : null;

  const range = `${config.sheetName}!${config.cell}`;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "google-sheets",
    accountId,
    apiCall: (accessToken) =>
      valuesUpdate({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        range,
        valueInputOption: config.valueInputOption,
        values: [[config.value]],
      }),
  });

  return {
    output: {
      spreadsheetId: result.spreadsheetId ?? config.spreadsheetId,
      sheetName: config.sheetName,
      cell: config.cell,
      updated: true,
      updatedRange: result.updatedRange ?? null,
      updatedCells: result.updatedCells ?? 0,
    },
  };
};
