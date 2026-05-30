import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { worksheetsList } from "../api/worksheetsList";
import { GetWorksheetsConfigSchema } from "./getWorksheets.schema";

/**
 * Excel `get_worksheets` action handler.
 *
 * Read-only — returns the ordered worksheet list for the given workbook.
 * Useful as a runtime primitive for workflows that fan out per-sheet.
 *
 * Output shape (downstream variable refs):
 *   { worksheets: [{ worksheetId, name, position, visibility }], count }
 */
export const getWorksheets: ActionHandler = async (input) => {
  const config = GetWorksheetsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-excel"
      ? input.triggerEvent.providerAccountId
      : null;

  const sheets = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-excel",
    providerAccountId,
    apiCall: (accessToken) =>
      worksheetsList({ accessToken, workbookId: config.workbookId }),
  });

  return {
    output: {
      worksheets: sheets.map((s) => ({
        worksheetId: s.id,
        name: s.name,
        position: s.position ?? null,
        visibility: s.visibility ?? null,
      })),
      count: sheets.length,
    },
  };
};
