import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { worksheetDelete } from "../api/worksheetDelete";
import { DeleteWorksheetConfigSchema } from "./deleteWorksheet.schema";

/**
 * Excel `delete_worksheet` action handler.
 *
 * Microsoft Excel parity Commit 2. Deletes one explicit worksheet
 * via Graph DELETE at `/workbook/worksheets('{worksheetName}')`. One
 * Graph round-trip.
 *
 * Per parity-microsoft-excel.md §7 + Marcus's audit acceptance:
 *   - Explicit `workbookId` + `worksheetName` required
 *     (schema-enforced).
 *   - No bulk delete (workflow authors compose a loop upstream).
 *   - No silent fallback (no "delete active sheet" / "delete first
 *     sheet" inference).
 *   - No silent no-op: Graph 404 surfaces as `NotFoundError` from
 *     the wrapper; trying to delete the workbook's last visible
 *     worksheet yields Graph HTTP 400 → generic Error.
 *
 * Output: `{ workbookId, worksheetName, deleted: true }`. The
 * `deleted: true` flag is a stable downstream variable ref (mirrors
 * the `delete_row` shape from Commit 1 and Slack 2.4
 * `delete_message`).
 */
export const deleteWorksheet: ActionHandler = async (input) => {
  const config = DeleteWorksheetConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-excel"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-excel",
    providerAccountId,
    apiCall: (accessToken) =>
      worksheetDelete({
        accessToken,
        workbookId: config.workbookId,
        worksheetName: config.worksheetName,
      }),
  });

  return {
    output: {
      workbookId: config.workbookId,
      worksheetName: config.worksheetName,
      deleted: true,
    },
  };
};
