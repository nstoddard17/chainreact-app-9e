import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:export_skill` (EDEN-5). Read action. */
export const edenExportSkillMeta: ActionMeta = {
  key: "eden:export_skill",
  provider: "eden",
  type: "export_skill",
  displayName: "Export Saved Prompt (Markdown)",
  description: "Export a saved Eden prompt/skill as portable Markdown.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace that owns the prompt. Leave empty for your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
    {
      name: "promptId",
      label: "Prompt / skill",
      description: "The saved prompt/skill to export. Pick a workspace first, or paste a prompt id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:prompts",
      allowManualEntry: true,
      dependsOn: "workspaceId",
      placeholder: "Select a saved prompt/skill",
    },
  ],
  outputs: [
    { name: "markdown", type: "string", description: "The prompt/skill exported as Markdown." },
    { name: "slug", type: "string", description: "The export slug, or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 62,
  riskLevel: "low",
};
