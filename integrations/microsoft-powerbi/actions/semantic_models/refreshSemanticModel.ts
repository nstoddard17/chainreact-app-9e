import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { refreshesCreate } from "../../api/datasets/refreshesCreate";
import { RefreshSemanticModelConfigSchema } from "./refreshSemanticModel.schema";

/**
 * Power BI `refresh_semantic_model` action handler.
 *
 * Kicks off an on-demand refresh of a semantic model (dataset) and
 * returns immediately with the refresh request id — refresh completion
 * is observed via the `semantic_model_refresh_completed/_failed/_canceled`
 * triggers or `get_semantic_model_refresh_history`. Power BI enforces its
 * own limits (8 refreshes/day on shared capacity); limit rejections
 * propagate to the engine as classified provider errors.
 *
 * Output shape (downstream variable refs):
 *   { refreshRequestId, workspaceId, semanticModelId, enhanced }
 */
export const refreshSemanticModel: ActionHandler = async (input) => {
  const config = RefreshSemanticModelConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const hasEnhanced =
    config.refreshType !== undefined ||
    config.commitMode !== undefined ||
    config.maxParallelism !== undefined ||
    config.retryCount !== undefined ||
    config.applyRefreshPolicy !== undefined;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      refreshesCreate({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
        notifyOption: config.notifyOption,
        enhanced: hasEnhanced
          ? {
              type: config.refreshType,
              commitMode: config.commitMode,
              maxParallelism: config.maxParallelism,
              retryCount: config.retryCount,
              applyRefreshPolicy: config.applyRefreshPolicy,
            }
          : undefined,
      }),
  });

  return {
    output: {
      refreshRequestId: result.refreshRequestId,
      workspaceId: config.workspaceId,
      semanticModelId: config.semanticModelId,
      enhanced: hasEnhanced,
    },
  };
};
