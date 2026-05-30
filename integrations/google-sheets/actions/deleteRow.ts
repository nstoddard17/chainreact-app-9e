import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { spreadsheetsBatchUpdate } from "../api/spreadsheetsBatchUpdate";
import { spreadsheetsGet } from "../api/spreadsheetsGet";
import { NotFoundError } from "../api/errors";
import {
  DeleteRowConfigSchema,
  type DeleteRowConfig,
} from "./deleteRow.schema";

/**
 * Google Sheets delete_row action handler (Sheets 2.1 Commit 2).
 *
 * Sheets has no single-row delete endpoint, so this composes two API
 * calls — both wrapped in `refreshAndRetry` per the auxiliary-call rule
 * in CLAUDE.md §"OAuth 401 handling":
 *   1. `spreadsheets.get` — resolve `sheetName` → numeric `sheetId`.
 *   2. `spreadsheets.batchUpdate` — one `deleteDimension` request that
 *      removes the half-open row range `[rowNumber-1, rowNumber)`.
 *
 * `sheetId` is required by the batchUpdate request shape; it's not the
 * same as `sheetName`. This is unavoidable Sheets API ergonomics.
 *
 * If `sheetName` doesn't exist in the spreadsheet, throws `NotFoundError`
 * before the batchUpdate call — same shape the wrapper would throw for
 * a missing spreadsheet id, so callers see one consistent error path.
 */
export const deleteRow: ActionHandler = async (input) => {
  const config: DeleteRowConfig = DeleteRowConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-sheets"
      ? input.triggerEvent.providerAccountId
      : null;

  const metadata = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-sheets",
    providerAccountId,
    apiCall: (accessToken) =>
      spreadsheetsGet({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        // Tighter fields mask — we only need the sheetId per sheet title.
        fields: "sheets(properties(sheetId,title))",
      }),
  });

  const sheet = (metadata.sheets ?? []).find(
    (s) => s.properties?.title === config.sheetName,
  );
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new NotFoundError(
      `sheet '${config.sheetName}' on spreadsheet ${config.spreadsheetId}`,
    );
  }

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-sheets",
    providerAccountId,
    apiCall: (accessToken) =>
      spreadsheetsBatchUpdate({
        accessToken,
        spreadsheetId: config.spreadsheetId,
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: config.rowNumber - 1,
                endIndex: config.rowNumber,
              },
            },
          },
        ],
      }),
  });

  return {
    output: {
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName,
      sheetId,
      rowNumber: config.rowNumber,
      deleted: true,
    },
  };
};
