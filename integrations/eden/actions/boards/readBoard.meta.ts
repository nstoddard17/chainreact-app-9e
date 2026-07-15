import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:read_board` (EDEN-4). Read action (bounded summary). */
export const edenReadBoardMeta: ActionMeta = {
  key: "eden:read_board",
  provider: "eden",
  type: "read_board",
  displayName: "Read Board",
  description: "Read a summary (item counts) of an Eden board.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace that owns the board. Leave empty to use your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
    {
      name: "itemId",
      label: "Board",
      description: "The board to read. Pick a workspace first, or paste a board id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:boards",
      dependsOn: "workspaceId",
      placeholder: "Select a board, or paste a board id",
    },
  ],
  outputs: [
    { name: "boardId", type: "string", description: "The board's id." },
    { name: "title", type: "string", description: "Board title, or null.", nullable: true },
    { name: "itemCount", type: "number", description: "Number of items on the board, or null.", nullable: true },
    { name: "stickyNoteCount", type: "number", description: "Number of sticky notes, or null.", nullable: true },
    { name: "textBlockCount", type: "number", description: "Number of text blocks, or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 32,
  riskLevel: "low",
};
