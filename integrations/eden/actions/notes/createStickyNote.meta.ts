import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:create_sticky_note` (EDEN-5). Write action. */
export const edenCreateStickyNoteMeta: ActionMeta = {
  key: "eden:create_sticky_note",
  provider: "eden",
  type: "create_sticky_note",
  displayName: "Create Sticky Note",
  description: "Add a sticky note to an Eden board.",
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
      description: "The board to add the sticky note to. Pick a workspace first, or paste a board id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:boards",
      dependsOn: "workspaceId",
      placeholder: "Select a board, or paste a board id",
    },
    { name: "content", label: "Content", description: "The sticky note text.", type: "textarea", required: true, placeholder: "Sticky note…" },
    { name: "color", label: "Color", description: "Optional sticky note color (e.g. yellow).", type: "text", required: false, placeholder: "yellow" },
  ],
  outputs: [
    { name: "noteId", type: "string", description: "The new sticky note's item id." },
    { name: "boardId", type: "string", description: "The board it was added to, or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 44,
  riskLevel: "low",
};
