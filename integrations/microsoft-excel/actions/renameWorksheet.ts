import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { worksheetPatch } from "../api/worksheetPatch";
import { RenameWorksheetConfigSchema } from "./renameWorksheet.schema";

/**
 * Excel `rename_worksheet` action handler.
 *
 * Microsoft Excel parity Commit 2. Renames an existing worksheet via
 * a single Graph PATCH at
 * `/workbook/worksheets('{worksheetName}')`. One Graph round-trip.
 *
 * Per parity-microsoft-excel.md §7 + Marcus's audit acceptance:
 *   - Explicit `workbookId` + `worksheetName` + `newWorksheetName`
 *     required (schema-enforced).
 *   - No silent fallback (e.g. "first worksheet if name missing").
 *   - No silent sanitization — Graph rejects illegal names with HTTP
 *     400 and that surfaces as a clear error through
 *     `surfaceGraphError`.
 *   - 401 / 404 / other-error contract identical to slice 15
 *     wrappers.
 *
 * Output: `{ workbookId, oldWorksheetName, newWorksheetName,
 * worksheetId, position, renamed: true }`. `worksheetId` is Graph's
 * stable id (`worksheet.id`), useful when downstream actions want to
 * address by id even though Commit 2 takes a name. `position` is
 * present when Graph includes it on the response (it does for
 * standard worksheets).
 */
export const renameWorksheet: ActionHandler = async (input) => {
  const config = RenameWorksheetConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-excel"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-excel",
    providerAccountId,
    apiCall: (accessToken) =>
      worksheetPatch({
        accessToken,
        workbookId: config.workbookId,
        worksheetName: config.worksheetName,
        name: config.newWorksheetName,
      }),
  });

  return {
    output: {
      workbookId: config.workbookId,
      oldWorksheetName: config.worksheetName,
      newWorksheetName: result.name,
      worksheetId: result.id,
      position: result.position ?? null,
      renamed: true,
    },
  };
};
