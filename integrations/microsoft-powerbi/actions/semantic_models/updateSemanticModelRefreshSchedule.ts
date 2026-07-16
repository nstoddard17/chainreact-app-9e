import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { refreshScheduleUpdate } from "../../api/datasets/refreshScheduleUpdate";
import { UpdateSemanticModelRefreshScheduleConfigSchema } from "./updateSemanticModelRefreshSchedule.schema";

/**
 * Power BI `update_semantic_model_refresh_schedule` action handler.
 *
 * Patches the model's scheduled-refresh settings — only provided fields
 * are sent. The connected user must OWN the model (pair with Take Over
 * Semantic Model).
 *
 * Output shape (downstream variable refs):
 *   { updated, semanticModelId }
 */
export const updateSemanticModelRefreshSchedule: ActionHandler = async (
  input,
) => {
  const config = UpdateSemanticModelRefreshScheduleConfigSchema.parse(
    input.config,
  );

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      refreshScheduleUpdate({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
        enabled: config.enabled,
        notifyOption: config.notifyOption,
        days: config.days,
        times: config.times,
        localTimeZoneId: config.localTimeZoneId,
      }),
  });

  return {
    output: {
      updated: true,
      semanticModelId: config.semanticModelId,
    },
  };
};
