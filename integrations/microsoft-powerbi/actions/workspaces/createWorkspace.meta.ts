import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:create_workspace`.
 * Mirrors `createWorkspace.schema.ts` 1:1 (camelCase field names).
 */
export const microsoftPowerBiCreateWorkspaceMeta: ActionMeta = {
  key: "microsoft-powerbi:create_workspace",
  provider: "microsoft-powerbi",
  type: "create_workspace",
  displayName: "Create Workspace",
  description:
    "Create a new Power BI workspace. The connected user becomes its admin; chain the returned workspace id into add-user or assign-to-capacity steps.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "name",
      label: "Workspace name",
      description: "Name for the new workspace, visible to everyone you add.",
      type: "text",
      required: true,
      placeholder: "e.g. Marketing Analytics",
    },
  ],
  outputs: [
    {
      name: "workspaceId",
      type: "string",
      description: "Id of the new workspace — chain into follow-up steps.",
    },
    { name: "name", type: "string", description: "Workspace name echoed for chaining." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 600,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a new workspace in the organization's Power BI tenant.",
};
