import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { worksheetRangeDelete } from "../api/worksheetRangeDelete";
import { DeleteRowConfigSchema } from "./deleteRow.schema";

/**
 * Excel `delete_row` action handler.
 *
 * Microsoft Excel parity Commit 1. Deletes one explicit row from a
 * worksheet, shifting subsequent rows up. Single Graph round-trip —
 * no usedRange / header read needed (delete is by row number, not by
 * column-value search).
 *
 * Behavior (per parity-microsoft-excel.md §7 + Marcus acceptance):
 *   - Explicit `workbookId` + `worksheetName` + `rowNumber` required
 *     (schema-enforced).
 *   - No bulk delete (no range, no column-value search). Workflow
 *     authors compose a loop upstream when they need multi-row
 *     deletion.
 *   - No silent no-op: Graph errors propagate verbatim
 *     (`NotFoundError` on missing worksheet, `Unauthorized401Error`
 *     on token expiry, generic `Error` on Graph 4xx/5xx).
 *
 * The address format `"{N}:{N}"` is Excel's full-row-range shorthand;
 * Graph deletes the entire row and shifts remaining rows up.
 *
 * Output: `{ workbookId, worksheetName, rowNumber, address,
 * deleted: true }`. `address` records the row range the handler
 * issued. `deleted` is a stable `true` flag downstream variable refs
 * can pin against (mirrors Slack 2.4 `delete_message` shape).
 */
export const deleteRow: ActionHandler = async (input) => {
  const config = DeleteRowConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-excel"
      ? input.triggerEvent.accountId
      : null;

  const address = `${config.rowNumber}:${config.rowNumber}`;

  await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-excel",
    accountId,
    apiCall: (accessToken) =>
      worksheetRangeDelete({
        accessToken,
        workbookId: config.workbookId,
        worksheetName: config.worksheetName,
        address,
        shift: "Up",
      }),
  });

  return {
    output: {
      workbookId: config.workbookId,
      worksheetName: config.worksheetName,
      rowNumber: config.rowNumber,
      address,
      deleted: true,
    },
  };
};
