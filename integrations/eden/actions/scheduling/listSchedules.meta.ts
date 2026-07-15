import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:list_schedules` (EDEN-4). Read action. */
export const edenListSchedulesMeta: ActionMeta = {
  key: "eden:list_schedules",
  provider: "eden",
  type: "list_schedules",
  displayName: "List Schedules",
  description: "List the posting schedules in an Eden workspace.",
  category: "scheduling",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace to read schedules from. Leave empty to use your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
  ],
  outputs: [
    { name: "schedules", type: "array", description: "Posting schedules. Each item: { id, name, timezone }." },
    { name: "workspaceId", type: "string", description: "The workspace the schedules belong to, or null.", nullable: true },
    { name: "count", type: "number", description: "Number of schedules returned." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 20,
  riskLevel: "low",
};
