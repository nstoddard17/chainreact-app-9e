import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { parametersUpdate } from "../../api/datasets/parametersUpdate";
import { UpdateSemanticModelParametersConfigSchema } from "./updateSemanticModelParameters.schema";

/**
 * Power BI `update_semantic_model_parameters` action handler.
 *
 * Updates mashup (Power Query) parameter values on a semantic model.
 * The connected user must OWN the model — chain Take Over Semantic Model
 * first when unsure. A refresh is needed afterward for the new values to
 * take effect.
 *
 * Output shape (downstream variable refs):
 *   { updated, parameterCount }
 */
export const updateSemanticModelParameters: ActionHandler = async (input) => {
  const config = UpdateSemanticModelParametersConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      parametersUpdate({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
        updates: config.parameters.map((p) => ({
          name: p.name,
          newValue: p.newValue,
        })),
      }),
  });

  return {
    output: {
      updated: true,
      parameterCount: config.parameters.length,
    },
  };
};
