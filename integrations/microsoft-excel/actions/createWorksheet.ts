import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { worksheetsAdd } from "../api/worksheetsAdd";
import { CreateWorksheetConfigSchema } from "./createWorksheet.schema";

/**
 * Excel `create_worksheet` action handler.
 *
 * Side-effectful — adds a new worksheet to the workbook. Excel
 * worksheet names must be ≤31 characters and unique within the workbook;
 * Graph returns HTTP 409 on duplicates, which surface as a generic
 * error from the underlying wrapper.
 *
 * Output shape (downstream variable refs):
 *   { worksheetId, name, position }
 */
export const createWorksheet: ActionHandler = async (input) => {
  const config = CreateWorksheetConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-excel"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-excel",
    accountId,
    apiCall: (accessToken) =>
      worksheetsAdd({
        accessToken,
        workbookId: config.workbookId,
        name: config.name,
      }),
  });

  return {
    output: {
      worksheetId: result.id,
      name: result.name,
      position: result.position ?? null,
    },
  };
};
