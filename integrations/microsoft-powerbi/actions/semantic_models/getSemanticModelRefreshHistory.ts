import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { refreshesList } from "../../api/datasets/refreshesList";
import { GetSemanticModelRefreshHistoryConfigSchema } from "./getSemanticModelRefreshHistory.schema";

/**
 * Power BI `get_semantic_model_refresh_history` action handler.
 *
 * Single-page read of the model's refresh history (newest first, provider
 * order). Failure entries surface only the parsed `errorCode` — the raw
 * `serviceExceptionJson` never enters workflow variables (bounded-output
 * rule; the wrapper parses it).
 *
 * Output shape (downstream variable refs):
 *   { refreshes: [{refreshRequestId, refreshType, status, startTime,
 *     endTime, errorCode}], count, hasMore }
 */
export const getSemanticModelRefreshHistory: ActionHandler = async (input) => {
  const config = GetSemanticModelRefreshHistoryConfigSchema.parse(
    input.config,
  );

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      refreshesList({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
        top: config.top,
      }),
  });

  const refreshes = result.refreshes.map((r) => ({
    refreshRequestId: r.refreshRequestId,
    refreshType: r.refreshType,
    status: r.status,
    startTime: r.startTime,
    endTime: r.endTime,
    errorCode: r.errorCode,
  }));

  return {
    output: {
      refreshes,
      count: refreshes.length,
      hasMore: result.hasMore,
    },
  };
};
