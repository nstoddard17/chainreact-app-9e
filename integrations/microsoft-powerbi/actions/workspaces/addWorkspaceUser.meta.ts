import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:add_workspace_user`.
 * Mirrors `addWorkspaceUser.schema.ts` 1:1 (camelCase field names).
 *
 * `principalEmail` / `principalIdentifier` are optional in the meta and
 * conditionally required by the runtime superRefine (per principal type);
 * `visibleWhen` shows exactly the field the chosen type uses.
 */
export const microsoftPowerBiAddWorkspaceUserMeta: ActionMeta = {
  key: "microsoft-powerbi:add_workspace_user",
  provider: "microsoft-powerbi",
  type: "add_workspace_user",
  displayName: "Add Workspace User",
  description:
    "Grant a user, security group, or app a role on a Power BI workspace. Access grants take effect for real people — pick the access right deliberately.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace to grant access to.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "principalType",
      label: "Principal type",
      description: "What kind of principal is being granted access.",
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
      label: "Access right",
      description:
        "Workspace role to grant. Admin can manage users and delete the workspace.",
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
    { name: "granted", type: "boolean", description: "True when the grant succeeded." },
    { name: "accessRight", type: "string", description: "The role that was granted." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 620,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Grants a real principal ongoing access to workspace content — an Admin grant includes user management and deletion rights.",
};
