import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:save_links_to_board` (EDEN-5). Write action. */
export const edenSaveLinksToBoardMeta: ActionMeta = {
  key: "eden:save_links_to_board",
  provider: "eden",
  type: "save_links_to_board",
  displayName: "Save Links to Board",
  description: "Save one or more URLs onto an Eden board.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace that owns the board. Leave empty for your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
    {
      name: "boardId",
      label: "Board",
      description: "The board to save links to. Pick a workspace first, or paste a board id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:boards",
      allowManualEntry: true,
      dependsOn: "workspaceId",
      placeholder: "Select a board, or paste a board id",
    },
    {
      name: "urls",
      label: "URLs",
      description: "One or more links to save to the board.",
      type: "string-array",
      required: true,
      placeholder: "https://example.com/article",
    },
  ],
  outputs: [
    { name: "boardId", type: "string", description: "The board the links were saved to." },
    { name: "itemsCreated", type: "number", description: "Number of links added, or null.", nullable: true },
    { name: "itemsSkipped", type: "number", description: "Number of links skipped (e.g. duplicates), or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 37,
  riskLevel: "low",
};
