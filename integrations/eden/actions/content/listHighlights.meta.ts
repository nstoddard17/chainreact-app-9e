import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:list_highlights` (EDEN-5). Read action. */
export const edenListHighlightsMeta: ActionMeta = {
  key: "eden:list_highlights",
  provider: "eden",
  type: "list_highlights",
  displayName: "List Highlights",
  description: "List the highlights saved by the connected Eden account.",
  category: "data",
  requiresIntegration: true,
  fields: [
    { name: "limit", label: "Limit", description: "Maximum highlights to return (1–100).", type: "number", required: false, placeholder: "25" },
    { name: "offset", label: "Offset", description: "Pagination offset.", type: "number", required: false, placeholder: "0" },
    { name: "orderBy", label: "Order by", description: "Optional ordering (provider-defined).", type: "text", required: false },
  ],
  outputs: [
    { name: "highlights", type: "array", description: "Highlights. Each: { id, text, url, createdAt }." },
    { name: "count", type: "number", description: "Number returned, or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 52,
  riskLevel: "low",
};
