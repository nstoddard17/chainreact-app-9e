import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:list_captures` (EDEN-5). Read action. */
export const edenListCapturesMeta: ActionMeta = {
  key: "eden:list_captures",
  provider: "eden",
  type: "list_captures",
  displayName: "List Captures",
  description: "List the web captures saved in an Eden workspace.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace to read from. Leave empty for your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
    { name: "status", label: "Status filter", description: "Optional capture status to filter by.", type: "text", required: false },
    { name: "limit", label: "Limit", description: "Maximum captures to return (1–100).", type: "number", required: false, placeholder: "25" },
    { name: "offset", label: "Offset", description: "Pagination offset.", type: "number", required: false, placeholder: "0" },
  ],
  outputs: [
    { name: "captures", type: "array", description: "Captures. Each: { id, title, url, status, createdAt }." },
    { name: "count", type: "number", description: "Number returned, or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 51,
  riskLevel: "low",
};
