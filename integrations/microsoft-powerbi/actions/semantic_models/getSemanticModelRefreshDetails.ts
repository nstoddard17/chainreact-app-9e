import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { refreshDetailsGet } from "../../api/datasets/refreshDetailsGet";
import { GetSemanticModelRefreshDetailsConfigSchema } from "./getSemanticModelRefreshDetails.schema";

/**
 * Power BI `get_semantic_model_refresh_details` action handler.
 *
 * Reads the execution details of one refresh by its request id (enhanced
 * / API-started refreshes only). Authors compose a loop on `status` /
 * `extendedStatus` to wait for completion — V2 deliberately does not
 * poll in-run.
 *
 * Output shape (downstream variable refs):
 *   { status, extendedStatus, currentRefreshType, startTime, endTime,
 *     commitMode, numberOfAttempts }
 */
export const getSemanticModelRefreshDetails: ActionHandler = async (input) => {
  const config = GetSemanticModelRefreshDetailsConfigSchema.parse(
    input.config,
  );

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const details = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      refreshDetailsGet({
        accessToken,
        groupId: config.workspaceId,
        datasetId: config.semanticModelId,
        refreshId: config.refreshRequestId,
      }),
  });

  return {
    output: {
      status: details.status,
      extendedStatus: details.extendedStatus,
      currentRefreshType: details.currentRefreshType,
      startTime: details.startTime,
      endTime: details.endTime,
      commitMode: details.commitMode,
      numberOfAttempts: details.numberOfAttempts,
    },
  };
};
