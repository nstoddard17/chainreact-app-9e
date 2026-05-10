import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { workbooksList } from "../api/workbooksList";
import { GetWorkbooksConfigSchema } from "./getWorkbooks.schema";

/**
 * Excel `get_workbooks` action handler.
 *
 * Lists `.xlsx` workbooks under the user's drive root. Read-only — does
 * NOT need Q4 idempotency (no side effects). The handler exists so
 * workflows can fan out across the user's workbooks without coupling
 * to a data-loader registry (which V2 hasn't ported from V1 yet).
 *
 * Output shape (downstream variable refs):
 *   { workbooks: [{ workbookId, name, webUrl, size,
 *                  lastModifiedDateTime }],
 *     count, hasMore, nextLink }
 */
export const getWorkbooks: ActionHandler = async (input) => {
  const config = GetWorkbooksConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "microsoft-excel"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "microsoft-excel",
    accountId,
    apiCall: (accessToken) =>
      workbooksList({ accessToken, top: config.top }),
  });

  return {
    output: {
      workbooks: result.workbooks.map((w) => ({
        workbookId: w.id,
        name: w.name,
        webUrl: w.webUrl,
        size: w.size,
        lastModifiedDateTime: w.lastModifiedDateTime,
      })),
      count: result.workbooks.length,
      hasMore: result.nextLink !== null,
      nextLink: result.nextLink,
    },
  };
};
