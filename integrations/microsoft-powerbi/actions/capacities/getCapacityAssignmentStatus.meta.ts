import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:get_capacity_assignment_status`.
 * Mirrors `getCapacityAssignmentStatus.schema.ts` 1:1 (camelCase names).
 */
export const microsoftPowerBiGetCapacityAssignmentStatusMeta: ActionMeta = {
  key: "microsoft-powerbi:get_capacity_assignment_status",
  provider: "microsoft-powerbi",
  type: "get_capacity_assignment_status",
  displayName: "Get Capacity Assignment Status",
  description:
    "Check the status of a workspace's most recent capacity assignment (Pending, InProgress, CompletedSuccessfully, or AssignmentFailed). Pair with Assign Workspace to Capacity to confirm the move finished.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace whose assignment status to read.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
  ],
  outputs: [
    {
      name: "status",
      type: "string",
      description:
        "Assignment status: Pending, InProgress, CompletedSuccessfully, or AssignmentFailed.",
    },
    {
      name: "capacityId",
      type: "string",
      description: "Capacity involved in the assignment. Null if the provider omitted it.",
      nullable: true,
    },
    {
      name: "activityId",
      type: "string",
      description:
        "Provider activity id (present on failure — quote it to Microsoft support). Null otherwise.",
      nullable: true,
    },
    {
      name: "startTime",
      type: "string",
      description: "Assignment start time. Null if the provider omitted it.",
      nullable: true,
    },
    {
      name: "endTime",
      type: "string",
      description: "Assignment end time. Null while still in progress or if omitted.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 810,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
