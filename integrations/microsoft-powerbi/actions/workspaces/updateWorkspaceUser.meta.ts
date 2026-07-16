import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:update_workspace_user`.
 * Mirrors `updateWorkspaceUser.schema.ts` 1:1 (camelCase field names).
 * Same field set as Add Workspace User — the provider's PUT takes the
 * same body; `accessRight` is the NEW role.
 */
export const microsoftPowerBiUpdateWorkspaceUserMeta: ActionMeta = {
  key: "microsoft-powerbi:update_workspace_user",
  provider: "microsoft-powerbi",
  type: "update_workspace_user",
  displayName: "Update Workspace User",
  description:
    "Change an existing user's, security group's, or app's role on a Power BI workspace. The access right you pick replaces the principal's current role.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace whose member role to change.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "principalType",
      label: "Principal type",
      description: "What kind of principal is having its role changed.",
      type: "select",
      required: true,
      options: [
        { value: "User", label: "User" },
        { value: "Group", label: "Security group" },
        { value: "App", label: "App (service principal)" },
      ],
    },
    {
      name: "principalEmail",
      label: "User email",
      description: "email/UPN of the user. Required for User principals.",
      type: "text",
      required: false,
      sensitivity: "recipient",
      placeholder: "user@contoso.com",
      visibleWhen: { field: "principalType", valueIn: ["User"] },
    },
    {
      name: "principalIdentifier",
      label: "Principal identifier",
      description:
        "Entra object id of the security group or app. Required for Group/App principals.",
      type: "text",
      required: false,
      sensitivity: "recipient",
      visibleWhen: { field: "principalType", valueIn: ["Group", "App"] },
    },
    {
      name: "accessRight",
      label: "New access right",
      description:
        "Replacement workspace role. Admin can manage users and delete the workspace.",
      type: "select",
      required: true,
      options: [
        { value: "Admin", label: "Admin" },
        { value: "Member", label: "Member" },
        { value: "Contributor", label: "Contributor" },
        { value: "Viewer", label: "Viewer" },
      ],
    },
  ],
  outputs: [
    { name: "updated", type: "boolean", description: "True when the role change succeeded." },
    { name: "accessRight", type: "string", description: "The new role that was applied." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 630,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Replaces a principal's workspace role — can escalate to Admin or downgrade to Viewer.",
};
