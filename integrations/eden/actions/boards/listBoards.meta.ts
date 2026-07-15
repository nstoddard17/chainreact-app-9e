import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:list_boards` (EDEN-5). Read action. */
export const edenListBoardsMeta: ActionMeta = {
  key: "eden:list_boards",
  provider: "eden",
  type: "list_boards",
  displayName: "List Boards",
  description: "List the boards (canvases) in an Eden workspace.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace to list boards from. Leave empty for your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
    { name: "limit", label: "Limit", description: "Maximum boards to return (1–100).", type: "number", required: false, placeholder: "25" },
    { name: "cursor", label: "Cursor", description: "Pagination cursor from a previous call's nextCursor.", type: "text", required: false },
  ],
  outputs: [
    { name: "boards", type: "array", description: "Boards. Each: { id, title, type, parentId, url, createdAt, updatedAt }." },
    { name: "totalCount", type: "number", description: "Total boards reported by Eden, or null.", nullable: true },
    { name: "nextCursor", type: "string", description: "Cursor for the next page, or null.", nullable: true },
    { name: "hasMore", type: "boolean", description: "True when another page is available." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 34,
  riskLevel: "low",
};
