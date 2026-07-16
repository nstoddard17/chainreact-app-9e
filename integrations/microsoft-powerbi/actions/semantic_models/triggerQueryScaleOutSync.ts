import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { scaleOutSyncTrigger } from "../../api/datasets/scaleOutSyncTrigger";
import { TriggerQueryScaleOutSyncConfigSchema } from "./triggerQueryScaleOutSync.schema";

/**
 * Power BI `trigger_query_scale_out_sync` action handler.
 *
 * Kicks off a sync of the model's read-only query scale-out replicas
 * (Premium-family feature). Pair with Get Query Scale Out Sync Status to
 * observe completion — V2 deliberately does not poll in-run.
 *
 * Output shape (downstream variable refs):
 *   { commitVersion, targetSyncVersion, triggerReason, syncStartTime }
 */
export const triggerQueryScaleOutSync: ActionHandler = async (input) => {
  const config = TriggerQueryScaleOutSyncConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      scaleOutSyncTrigger({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
      }),
  });

  return {
    output: {
      commitVersion: result.commitVersion,
      targetSyncVersion: result.targetSyncVersion,
      triggerReason: result.triggerReason,
      syncStartTime: result.syncStartTime,
    },
  };
};
