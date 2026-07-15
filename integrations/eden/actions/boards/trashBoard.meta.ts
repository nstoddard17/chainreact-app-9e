import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `eden:trash_board` (EDEN-4). Write action. Moving a board to trash is
 * REVERSIBLE in Eden (it is not permanent deletion), so this is medium risk, not destructive.
 */
export const edenTrashBoardMeta: ActionMeta = {
  key: "eden:trash_board",
  provider: "eden",
  type: "trash_board",
  displayName: "Trash Board",
  description: "Move an Eden board to trash (reversible in Eden).",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace that owns the board (helps populate the picker). Leave empty for your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
    {
      name: "boardId",
      label: "Board",
      description: "The board to move to trash. Pick a workspace first, or paste a board id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:boards",
      dependsOn: "workspaceId",
      placeholder: "Select a board, or paste a board id",
    },
  ],
  outputs: [{ name: "boardId", type: "string", description: "The trashed board's id." }],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 33,
  riskLevel: "medium",
  riskDescription: "Moves the board to trash. Reversible from Eden's trash.",
};
