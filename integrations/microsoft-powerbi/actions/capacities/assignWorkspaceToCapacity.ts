import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { groupAssignToCapacity } from "../../api/groups/groupAssignToCapacity";
import { AssignWorkspaceToCapacityConfigSchema } from "./assignWorkspaceToCapacity.schema";

/**
 * Power BI `assign_workspace_to_capacity` action handler.
 *
 * Assigns a workspace to a capacity via
 * `POST /groups/{workspaceId}/AssignToCapacity`. The provider 200
 * acknowledges the request; the assignment itself completes
 * asynchronously — chain `get_capacity_assignment_status` to observe it.
 *
 * Output shape (downstream variable refs):
 *   { assigned, workspaceId, capacityId }
 */
export const assignWorkspaceToCapacity: ActionHandler = async (input) => {
  const config = AssignWorkspaceToCapacityConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-powerbi"
      ? input.triggerEvent.providerAccountId
      : null;

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      groupAssignToCapacity({
        accessToken,
        groupId: config.workspaceId,
        capacityId: config.capacityId,
      }),
  });

  return {
    output: {
      assigned: true,
      workspaceId: config.workspaceId,
      capacityId: config.capacityId,
    },
  };
};
