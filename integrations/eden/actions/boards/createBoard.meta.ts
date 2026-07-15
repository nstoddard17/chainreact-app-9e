import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:create_board` (EDEN-4). Write action. */
export const edenCreateBoardMeta: ActionMeta = {
  key: "eden:create_board",
  provider: "eden",
  type: "create_board",
  displayName: "Create Board",
  description: "Create a board in an Eden workspace.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace to create the board in. Leave empty to use your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
    {
      name: "title",
      label: "Board title",
      description: "The name for the new board.",
      type: "text",
      required: true,
      placeholder: "Content ideas",
    },
  ],
  outputs: [
    { name: "boardId", type: "string", description: "The new board's id." },
    { name: "title", type: "string", description: "Provider-confirmed board title, or null.", nullable: true },
    { name: "workspaceId", type: "string", description: "The workspace the board was created in, or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 30,
  riskLevel: "low",
};
