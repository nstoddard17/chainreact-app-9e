import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { scaleOutSyncStatusGet } from "../../api/datasets/scaleOutSyncStatusGet";
import { GetQueryScaleOutSyncStatusConfigSchema } from "./getQueryScaleOutSyncStatus.schema";

/**
 * Power BI `get_query_scale_out_sync_status` action handler.
 *
 * Reads the replica sync state of a query scale-out enabled semantic
 * model (Premium-family feature). Authors compose a loop comparing
 * `minActiveReadVersion` to `commitVersion` to wait for sync completion.
 *
 * Output shape (downstream variable refs):
 *   { commitVersion, targetSyncVersion, minActiveReadVersion,
 *     triggerReason, syncStartTime, syncEndTime }
 */
export const getQueryScaleOutSyncStatus: ActionHandler = async (input) => {
  const config = GetQueryScaleOutSyncStatusConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      scaleOutSyncStatusGet({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
      }),
  });

  return {
    output: {
      commitVersion: result.commitVersion,
      targetSyncVersion: result.targetSyncVersion,
      minActiveReadVersion: result.minActiveReadVersion,
      triggerReason: result.triggerReason,
      syncStartTime: result.syncStartTime,
      syncEndTime: result.syncEndTime,
    },
  };
};
