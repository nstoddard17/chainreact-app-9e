import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:list_notes` (EDEN-5). Read action. */
export const edenListNotesMeta: ActionMeta = {
  key: "eden:list_notes",
  provider: "eden",
  type: "list_notes",
  displayName: "List Notes",
  description: "List note items in an Eden workspace (one page).",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace to read notes from. Leave empty for your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
    { name: "limit", label: "Limit", description: "Maximum notes to return (1–100).", type: "number", required: false, placeholder: "25" },
    { name: "cursor", label: "Cursor", description: "Pagination cursor from a previous call's nextCursor.", type: "text", required: false },
  ],
  outputs: [
    { name: "notes", type: "array", description: "Note items. Each: { id, title, type, parentId, url, createdAt, updatedAt }." },
    { name: "count", type: "number", description: "Items in this page, or null.", nullable: true },
    { name: "totalCount", type: "number", description: "Total notes reported by Eden, or null.", nullable: true },
    { name: "nextCursor", type: "string", description: "Cursor for the next page, or null.", nullable: true },
    { name: "hasMore", type: "boolean", description: "True when another page is available." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 45,
  riskLevel: "low",
};
