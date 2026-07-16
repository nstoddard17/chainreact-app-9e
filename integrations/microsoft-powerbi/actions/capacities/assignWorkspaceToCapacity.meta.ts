import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:assign_workspace_to_capacity`.
 * Mirrors `assignWorkspaceToCapacity.schema.ts` 1:1 (camelCase names).
 *
 * Unassigning (the provider's empty-GUID path) is deliberately NOT
 * exposed — moving a workspace OFF capacity silently changes feature
 * availability and is left to the Power BI portal.
 */
export const microsoftPowerBiAssignWorkspaceToCapacityMeta: ActionMeta = {
  key: "microsoft-powerbi:assign_workspace_to_capacity",
  provider: "microsoft-powerbi",
  type: "assign_workspace_to_capacity",
  displayName: "Assign Workspace to Capacity",
  description:
    "Assign a Power BI workspace to a capacity. Moving workspaces between capacities changes which features are available to its content (Premium/Fabric features, large models, higher refresh limits). Requires capacity admin or assign permission plus workspace admin. Assignment completes asynchronously — chain Get Capacity Assignment Status to confirm.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace to assign (you must be its admin).",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "capacityId",
      label: "Capacity",
      description:
        "The capacity to assign the workspace to. Only capacities you can assign to are listed.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:capacities",
      placeholder: "Search capacities…",
    },
  ],
  outputs: [
    { name: "assigned", type: "boolean", description: "True when the assignment request was accepted." },
    { name: "workspaceId", type: "string", description: "Workspace id echoed for chaining." },
    { name: "capacityId", type: "string", description: "Capacity id echoed for chaining." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 800,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Moves the workspace onto a different capacity, changing feature availability and billing footprint for all of its content.",
};
