import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { takeOver } from "../../api/datasets/takeOver";
import { TakeOverSemanticModelConfigSchema } from "./takeOverSemanticModel.schema";

/**
 * Power BI `take_over_semantic_model` action handler.
 *
 * Transfers ownership of a semantic model to the connected user — the
 * required precursor to updating parameters / data sources / refresh
 * schedule when the caller isn't already the owner. Scheduled refresh
 * then runs under the new owner's credentials.
 *
 * Output shape (downstream variable refs):
 *   { takenOver, semanticModelId }
 */
export const takeOverSemanticModel: ActionHandler = async (input) => {
  const config = TakeOverSemanticModelConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      takeOver({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
      }),
  });

  return {
    output: {
      takenOver: true,
      semanticModelId: config.semanticModelId,
    },
  };
};
