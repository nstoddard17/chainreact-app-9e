import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `POST /v1.0/myorg/groups/{groupId}/AssignToCapacity`
 * (Groups AssignToCapacity). Scopes: `Capacity.ReadWrite.All` AND
 * `Workspace.ReadWrite.All`; caller needs admin or assign permission on
 * the capacity plus workspace admin.
 *
 * Body: `{capacityId}`. The documented empty-GUID
 * (`00000000-0000-0000-0000-000000000000`) UNASSIGN path is deliberately
 * NOT exposed by ChainReact — the action schema rejects it before this
 * wrapper is reached; the wrapper guards again fail-closed.
 *
 * 200 acknowledges the request; assignment completes asynchronously —
 * observe via Groups CapacityAssignmentStatus.
 */

const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

export interface GroupAssignToCapacityInput {
  accessToken: string;
  groupId: string;
  capacityId: string;
}

export async function groupAssignToCapacity(
  input: GroupAssignToCapacityInput,
): Promise<void> {
  if (input.capacityId === EMPTY_GUID) {
    throw new Error(
      "Power BI group AssignToCapacity POST rejected: unassigning (empty capacity GUID) is not supported.",
    );
  }

  await powerbiFetch({
    accessToken: input.accessToken,
    method: "POST",
    path: `/groups/${encodeURIComponent(input.groupId)}/AssignToCapacity`,
    body: { capacityId: input.capacityId },
    notFoundResource: `workspace ${input.groupId}`,
    operation: "group AssignToCapacity POST",
  });
}
