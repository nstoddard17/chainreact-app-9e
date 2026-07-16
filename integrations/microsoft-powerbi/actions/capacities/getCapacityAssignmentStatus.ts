import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { groupCapacityAssignmentStatusGet } from "../../api/groups/groupCapacityAssignmentStatusGet";
import { GetCapacityAssignmentStatusConfigSchema } from "./getCapacityAssignmentStatus.schema";

/**
 * Power BI `get_capacity_assignment_status` action handler.
 *
 * Reads the workspace's most recent capacity-assignment operation via
 * `GET /groups/{workspaceId}/CapacityAssignmentStatus` — the read-back
 * pair for `assign_workspace_to_capacity` (authors compose a loop on
 * `status` until it is terminal).
 *
 * Output shape (downstream variable refs):
 *   { status, capacityId, activityId, startTime, endTime }
 */
export const getCapacityAssignmentStatus: ActionHandler = async (input) => {
  const config = GetCapacityAssignmentStatusConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      groupCapacityAssignmentStatusGet({
        accessToken,
        groupId: config.workspaceId,
      }),
  });

  return {
    output: {
      status: result.status,
      capacityId: result.capacityId,
      activityId: result.activityId,
      startTime: result.startTime,
      endTime: result.endTime,
    },
  };
};
