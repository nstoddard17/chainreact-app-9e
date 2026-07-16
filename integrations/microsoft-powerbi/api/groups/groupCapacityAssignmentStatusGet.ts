import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `GET /v1.0/myorg/groups/{groupId}/CapacityAssignmentStatus`
 * (Groups CapacityAssignmentStatus). Scope: `Workspace.Read.All` /
 * `Workspace.ReadWrite.All`.
 *
 * Documented fields: `status` (Pending | InProgress |
 * CompletedSuccessfully | AssignmentFailed), `capacityId`, `activityId`
 * (present on failure), `startTime`, `endTime`. Everything but `status`
 * may be absent → mapped to null (fixed key set).
 */

export interface GroupCapacityAssignmentStatusGetInput {
  accessToken: string;
  groupId: string;
}

export interface GroupCapacityAssignmentStatusResult {
  status: string;
  capacityId: string | null;
  activityId: string | null;
  startTime: string | null;
  endTime: string | null;
}

interface StatusBody {
  status?: string;
  capacityId?: string;
  activityId?: string;
  startTime?: string;
  endTime?: string;
}

export async function groupCapacityAssignmentStatusGet(
  input: GroupCapacityAssignmentStatusGetInput,
): Promise<GroupCapacityAssignmentStatusResult> {
  const res = await powerbiFetch({
    accessToken: input.accessToken,
    method: "GET",
    path: `/groups/${encodeURIComponent(input.groupId)}/CapacityAssignmentStatus`,
    notFoundResource: `workspace ${input.groupId}`,
    operation: "group CapacityAssignmentStatus GET",
  });

  const body = (await res.json()) as StatusBody;
  if (typeof body.status !== "string" || body.status.length === 0) {
    // `status` is the one documented-always field; a missing status means
    // an undocumented response shape — fail loudly rather than emit nulls.
    throw new Error(
      "Power BI group CapacityAssignmentStatus GET returned an unexpected response (missing status).",
    );
  }
  return {
    status: body.status,
    capacityId: typeof body.capacityId === "string" ? body.capacityId : null,
    activityId: typeof body.activityId === "string" ? body.activityId : null,
    startTime: typeof body.startTime === "string" ? body.startTime : null,
    endTime: typeof body.endTime === "string" ? body.endTime : null,
  };
}
