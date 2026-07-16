import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:search_items` (EDEN-5). Read action. */
export const edenSearchItemsMeta: ActionMeta = {
  key: "eden:search_items",
  provider: "eden",
  type: "search_items",
  displayName: "Search Workspace Items",
  description: "Search an Eden workspace for notes, saved links/posts, and boards by text.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace to search. Leave empty for your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
    { name: "query", label: "Search text", description: "Text to search for.", type: "text", required: true, placeholder: "Search…" },
    {
      name: "type",
      label: "Type filter",
      description:
        "Only include one item type. Eden types boards as `canvas` and notes as `markdown`. Leave empty for all types.",
      type: "text",
      required: false,
      placeholder: "canvas",
    },
    { name: "limit", label: "Limit", description: "Maximum items to return (1–100).", type: "number", required: false, placeholder: "25" },
    { name: "cursor", label: "Cursor", description: "Pagination cursor from a previous call's nextCursor.", type: "text", required: false, advanced: true },
  ],
  outputs: [
    { name: "items", type: "array", description: "Matching items. Each: { id, title, type, parentId, url, createdAt, updatedAt }." },
    { name: "count", type: "number", description: "Items in this page, or null.", nullable: true },
    { name: "totalCount", type: "number", description: "Total matches reported by Eden, or null.", nullable: true },
    { name: "nextCursor", type: "string", description: "Cursor for the next page, or null.", nullable: true },
    { name: "hasMore", type: "boolean", description: "True when another page is available." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 46,
  riskLevel: "low",
};
