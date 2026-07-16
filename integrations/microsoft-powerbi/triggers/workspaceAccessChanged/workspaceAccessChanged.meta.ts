import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:workspace_access_changed`.
 *
 * One event per principal whose workspace role was granted, changed, or
 * revoked. `principal` is marked sensitive — for user principals it is an
 * email address / UPN.
 */
export const microsoftPowerBiWorkspaceAccessChangedTriggerMeta: TriggerMeta = {
  key: "microsoft-powerbi:workspace_access_changed",
  provider: "microsoft-powerbi",
  type: "workspace_access_changed",
  displayName: "Workspace Access Changed",
  description:
    "Fires once for each person, group, or app whose workspace role is granted, changed, or removed. Existing access when the workflow is turned on doesn't fire.",
  category: "data",
  activation: "polling",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace whose access list is watched.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
  ],
  payloadShape: [
    { name: "workspaceId", type: "string", description: "The workspace whose access changed." },
    {
      name: "principal",
      type: "string",
      description: "The person's email, or the id of the group / app whose access changed.",
      sensitive: true,
    },
    { name: "changeType", type: "string", description: "One of added, changed, removed." },
    {
      name: "accessRight",
      type: "string",
      description: "The new role (Admin, Member, Contributor, Viewer); null when access was removed.",
      nullable: true,
    },
    {
      name: "previousAccessRight",
      type: "string",
      description: "The role held before this change; null when access was newly added.",
      nullable: true,
    },
  ],
  displayOrder: 160,
};
