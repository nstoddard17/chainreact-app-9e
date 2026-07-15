import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:list_creator_lists` (EDEN-5). Read action. */
export const edenListCreatorListsMeta: ActionMeta = {
  key: "eden:list_creator_lists",
  provider: "eden",
  type: "list_creator_lists",
  displayName: "List Creator Lists",
  description: "List the creator lists in an Eden workspace.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace to read from. Leave empty for your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
  ],
  outputs: [
    { name: "lists", type: "array", description: "Creator lists. Each: { id, name, memberCount }." },
    { name: "count", type: "number", description: "Number returned, or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 70,
  riskLevel: "low",
};
