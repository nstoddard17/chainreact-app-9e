import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { valuesGet } from "../api/valuesGet";
import {
  GetCellValueConfigSchema,
  type GetCellValueConfig,
} from "./getCellValue.schema";

/**
 * Google Sheets `spreadsheets.values.get` single-cell action handler
 * (Sheets 2.1 Commit 1).
 *
 * Reads a single cell from a Google Sheet. Wraps the principal API call
 * in `refreshAndRetry` (Q3); read-only so no idempotency concern.
 *
 * Empty-cell convention: when the cell is blank, Google returns no
 * `values` key (or an empty rows array). V2 surfaces this as `value: null`
 * so downstream workflows can branch on `{{node.value}} == null`. The
 * unit tests pin both populated and empty paths.
 */
export const getCellValue: ActionHandler = async (input) => {
  const config: GetCellValueConfig = GetCellValueConfigSchema.parse(input.config);

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
      valuesGet({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        range,
      }),
  });

  const value = result.values?.[0]?.[0] ?? null;

  return {
    output: {
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName,
      cell: config.cell,
      value,
    },
  };
};
