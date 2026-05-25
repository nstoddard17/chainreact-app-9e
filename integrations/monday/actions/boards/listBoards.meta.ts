import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `list_boards` ActionMeta — Slice 3.MONDAY-6. Pure read.
 * Account-scoped — no board picker (it discovers boards).
 */
export const mondayListBoardsMeta: ActionMeta = {
  key: "monday:list_boards",
  provider: "monday",
  type: "list_boards",
  displayName: "List Boards",
  description: "List the Monday boards visible to the connected account.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "limit",
      label: "Limit",
      type: "number",
      required: false,
      defaultValue: 25,
      numeric: { min: 1, max: 100, integer: true },
    },
    {
      name: "cursor",
      label: "Next-page cursor",
      type: "text",
      required: false,
      placeholder: "Page index from a previous call",
    },
  ],
  outputs: [
    { name: "boards", type: "array", description: "Boards on this page.", sensitive: true },
    { name: "count", type: "number", description: "Number of boards returned." },
    { name: "hasMore", type: "boolean", description: "True when more pages exist." },
    { name: "nextCursor", type: "string", description: "Cursor for the next page (or null)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 140,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
