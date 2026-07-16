import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:remove_workspace_user`.
 * Mirrors `removeWorkspaceUser.schema.ts` 1:1 (camelCase field names).
 *
 * The `principalIdentifier` picker lists the workspace's current
 * principals (value = the exact email/UPN or object id the DELETE path
 * accepts); manual entry is allowed for principals the list can't show.
 */
export const microsoftPowerBiRemoveWorkspaceUserMeta: ActionMeta = {
  key: "microsoft-powerbi:remove_workspace_user",
  provider: "microsoft-powerbi",
  type: "remove_workspace_user",
  displayName: "Remove Workspace User",
  description:
    "Revoke a user's, security group's, or app's access to a Power BI workspace. The principal immediately loses its workspace role.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace to remove the principal from.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "principalIdentifier",
      label: "Principal",
      description:
        "The principal to remove — its email/UPN or object id, exactly as the workspace user list returns it.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspace_users",
      dependsOn: "workspaceId",
      allowManualEntry: true,
      sensitivity: "recipient",
      placeholder: "Search workspace users…",
    },
  ],
  outputs: [
    { name: "removed", type: "boolean", description: "True when the removal succeeded." },
    {
      name: "principalIdentifier",
      type: "string",
      description:
        "Identifier of the removed principal (may be an email address).",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 640,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Immediately revokes a real principal's access to workspace content — an accidental removal can break dashboards and downstream access for that person or app.",
};
