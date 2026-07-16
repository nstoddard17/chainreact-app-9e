import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { bindToGateway } from "../../api/datasets/bindToGateway";
import { BindSemanticModelToGatewayConfigSchema } from "./bindSemanticModelToGateway.schema";

/**
 * Power BI `bind_semantic_model_to_gateway` action handler.
 *
 * Binds a semantic model to an on-premises data gateway (optionally to
 * specific gateway data sources). The connected user must be a data
 * source user on the gateway — Power BI rejects the bind otherwise.
 *
 * Output shape (downstream variable refs):
 *   { bound, gatewayId }
 */
export const bindSemanticModelToGateway: ActionHandler = async (input) => {
  const config = BindSemanticModelToGatewayConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      bindToGateway({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
        gatewayObjectId: config.gatewayId,
        datasourceObjectIds: config.datasourceObjectIds,
      }),
  });

  return {
    output: {
      bound: true,
      gatewayId: config.gatewayId,
    },
  };
};
