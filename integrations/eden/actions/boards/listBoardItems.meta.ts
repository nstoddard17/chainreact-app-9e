import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:list_board_items` (EDEN-5). Read action. */
export const edenListBoardItemsMeta: ActionMeta = {
  key: "eden:list_board_items",
  provider: "eden",
  type: "list_board_items",
  displayName: "List Board Items",
  description: "List the items (notes, saved links/posts, stickies) on an Eden board.",
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
      description: "The board to list items from. Pick a workspace first, or paste a board id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:boards",
      dependsOn: "workspaceId",
      placeholder: "Select a board, or paste a board id",
    },
    { name: "limit", label: "Limit", description: "Maximum items to return (1–100).", type: "number", required: false, placeholder: "25" },
    { name: "cursor", label: "Cursor", description: "Pagination cursor from a previous call's nextCursor.", type: "text", required: false, advanced: true },
  ],
  outputs: [
    { name: "items", type: "array", description: "Board items. Each: { id, title, type, parentId, url, createdAt, updatedAt }." },
    { name: "count", type: "number", description: "Items in this page, or null.", nullable: true },
    { name: "totalCount", type: "number", description: "Total items reported by Eden, or null.", nullable: true },
    { name: "nextCursor", type: "string", description: "Cursor for the next page, or null.", nullable: true },
    { name: "hasMore", type: "boolean", description: "True when another page is available." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 35,
  riskLevel: "low",
};
