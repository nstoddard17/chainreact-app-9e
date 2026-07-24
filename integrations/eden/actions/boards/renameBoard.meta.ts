import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:rename_board` (EDEN-5). Write action. */
export const edenRenameBoardMeta: ActionMeta = {
  key: "eden:rename_board",
  provider: "eden",
  type: "rename_board",
  displayName: "Rename Board",
  description: "Change an Eden board's name.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace that owns the board (helps the picker). Leave empty for your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
    {
      name: "boardId",
      label: "Board",
      description: "The board to rename. Pick a workspace first, or paste a board id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:boards",
      allowManualEntry: true,
      dependsOn: "workspaceId",
      placeholder: "Select a board, or paste a board id",
    },
    { name: "name", label: "New name", description: "The new board name.", type: "text", required: true, placeholder: "Board name" },
  ],
  outputs: [
    { name: "boardId", type: "string", description: "The renamed board's id." },
    { name: "name", type: "string", description: "Provider-confirmed new name, or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 36,
  riskLevel: "low",
};
