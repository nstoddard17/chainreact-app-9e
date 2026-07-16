import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { refreshesDelete } from "../../api/datasets/refreshesDelete";
import { CancelSemanticModelRefreshConfigSchema } from "./cancelSemanticModelRefresh.schema";

/**
 * Power BI `cancel_semantic_model_refresh` action handler.
 *
 * Cancels an in-flight ENHANCED (API-started) refresh by its request id.
 * Standard/scheduled refreshes can't be canceled — Power BI rejects the
 * DELETE and the error propagates to the engine.
 *
 * Output shape (downstream variable refs):
 *   { canceled, refreshRequestId, semanticModelId }
 */
export const cancelSemanticModelRefresh: ActionHandler = async (input) => {
  const config = CancelSemanticModelRefreshConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      refreshesDelete({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
        refreshId: config.refreshRequestId,
      }),
  });

  return {
    output: {
      canceled: true,
      refreshRequestId: config.refreshRequestId,
      semanticModelId: config.semanticModelId,
    },
  };
};
