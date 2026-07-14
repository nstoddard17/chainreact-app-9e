import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:list_scheduled_posts` (EDEN-4). Read action. */
export const edenListScheduledPostsMeta: ActionMeta = {
  key: "eden:list_scheduled_posts",
  provider: "eden",
  type: "list_scheduled_posts",
  displayName: "List Scheduled Posts",
  description: "List queued and sent posts in an Eden workspace (one page).",
  category: "scheduling",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace to read from. Leave empty to use your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
    {
      name: "status",
      label: "Status filter",
      description: "Optional status to filter by (e.g. queued, sent).",
      type: "text",
      required: false,
      placeholder: "queued",
    },
    {
      name: "limit",
      label: "Limit",
      description: "Maximum posts to return (1–100).",
      type: "number",
      required: false,
      placeholder: "25",
    },
  ],
  outputs: [
    { name: "posts", type: "array", description: "Scheduled posts. Each item: { id, status, scheduledFor }." },
    { name: "count", type: "number", description: "Total count reported by Eden, or null.", nullable: true },
    { name: "mode", type: "string", description: "The list mode Eden applied, or null.", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 21,
  riskLevel: "low",
};
