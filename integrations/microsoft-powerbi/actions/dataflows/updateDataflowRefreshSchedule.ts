import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { dataflowRefreshScheduleUpdate } from "../../api/dataflows/dataflowRefreshScheduleUpdate";
import { UpdateDataflowRefreshScheduleConfigSchema } from "./updateDataflowRefreshSchedule.schema";

/**
 * Power BI `update_dataflow_refresh_schedule` action handler.
 *
 * Creates or updates a dataflow's scheduled-refresh settings (PATCH
 * semantics — only provided fields are sent; absent ones keep their
 * provider-side values).
 *
 * Output shape: { updated: true, dataflowId }
 */
export const updateDataflowRefreshSchedule: ActionHandler = async (input) => {
  const config = UpdateDataflowRefreshScheduleConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      dataflowRefreshScheduleUpdate({
        accessToken,
        groupId: config.workspaceId,
        dataflowId: config.dataflowId,
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
      dataflowId: config.dataflowId,
    },
  };
};
