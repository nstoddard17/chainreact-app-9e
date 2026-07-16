import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { dataflowRefreshCreate } from "../../api/dataflows/dataflowRefreshCreate";
import { RefreshDataflowConfigSchema } from "./refreshDataflow.schema";

/**
 * Power BI `refresh_dataflow` action handler.
 *
 * Starts an on-demand refresh of a Gen1 dataflow. Unlike dataset
 * refreshes, the API returns NO refresh id — completion is observed
 * via Get Dataflow Refresh History (transactions), which authors
 * compose downstream.
 *
 * Output shape: { started: true, dataflowId }
 */
export const refreshDataflow: ActionHandler = async (input) => {
  const config = RefreshDataflowConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      dataflowRefreshCreate({
        accessToken,
        groupId: config.workspaceId,
        dataflowId: config.dataflowId,
        notifyOption: config.notifyOption,
      }),
  });

  return {
    output: {
      started: true,
      dataflowId: config.dataflowId,
    },
  };
};
