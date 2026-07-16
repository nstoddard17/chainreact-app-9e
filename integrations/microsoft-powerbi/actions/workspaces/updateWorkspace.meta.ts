import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:update_workspace`.
 * Mirrors `updateWorkspace.schema.ts` 1:1 (camelCase field names). Both
 * update fields are optional in the meta; the runtime refinement requires
 * at least one.
 */
export const microsoftPowerBiUpdateWorkspaceMeta: ActionMeta = {
  key: "microsoft-powerbi:update_workspace",
  provider: "microsoft-powerbi",
  type: "update_workspace",
  displayName: "Update Workspace",
  description:
    "Rename a Power BI workspace and/or update its description. Only the fields you fill in are changed — at least one is required.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace to update.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "name",
      label: "New name",
      description: "New workspace name. Leave blank to keep the current name.",
      type: "text",
      required: false,
    },
    {
      name: "description",
      label: "New description",
      description:
        "New workspace description. Leave blank to keep the current description.",
      type: "textarea",
      required: false,
    },
  ],
  outputs: [
    { name: "updated", type: "boolean", description: "True when the update succeeded." },
    { name: "workspaceId", type: "string", description: "Workspace id echoed for chaining." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 610,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Renames or re-describes a workspace visible to all of its members.",
};
