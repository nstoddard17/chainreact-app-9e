import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:list_prompts` (EDEN-5). Read action. */
export const edenListPromptsMeta: ActionMeta = {
  key: "eden:list_prompts",
  provider: "eden",
  type: "list_prompts",
  displayName: "List Saved Prompts & Skills",
  description: "List the saved prompts and skills in an Eden workspace.",
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
    { name: "prompts", type: "array", description: "Saved prompts & skills. Each: { id, title, summary, description, category, source }." },
    { name: "count", type: "number", description: "Number returned." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 60,
  riskLevel: "low",
};
