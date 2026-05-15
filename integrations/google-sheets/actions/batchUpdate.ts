import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { valuesBatchUpdate } from "../api/valuesBatchUpdate";
import {
  BatchUpdateConfigSchema,
  type BatchUpdateConfig,
} from "./batchUpdate.schema";

/**
 * Google Sheets `spreadsheets.values.batchUpdate` action handler
 * (Sheets 2.2 Commit 2).
 *
 * Multi-range cell write. Wraps the principal API call in
 * `refreshAndRetry` (Q3). Q11 required `valueInputOption` is
 * forwarded verbatim from the schema; each update's `range` already
 * carries its sheet-name prefix (enforced at parse time).
 *
 * Output projection is bounded — `responses[]` projects only the
 * four canonical update counters per entry, NOT the raw Google
 * response shape. Totals at the top level mirror Sheets' response.
 */
export const batchUpdate: ActionHandler = async (input) => {
  const config: BatchUpdateConfig = BatchUpdateConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "google-sheets"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "google-sheets",
    accountId,
    apiCall: (accessToken) =>
      valuesBatchUpdate({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        valueInputOption: config.valueInputOption,
        data: config.updates.map((u) => ({
          range: u.range,
          values: u.values,
        })),
      }),
  });

  const responses = (result.responses ?? []).map((r) => ({
    updatedRange: r.updatedRange ?? null,
    updatedRows: r.updatedRows ?? 0,
    updatedColumns: r.updatedColumns ?? 0,
    updatedCells: r.updatedCells ?? 0,
  }));

  return {
    output: {
      spreadsheetId: result.spreadsheetId ?? config.spreadsheetId,
      totalUpdatedRanges: responses.length,
      totalUpdatedCells: result.totalUpdatedCells ?? 0,
      totalUpdatedRows: result.totalUpdatedRows ?? 0,
      totalUpdatedColumns: result.totalUpdatedColumns ?? 0,
      responses,
    },
  };
};
