import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:following_overview` (EDEN-5). Read action. */
export const edenFollowingOverviewMeta: ActionMeta = {
  key: "eden:following_overview",
  provider: "eden",
  type: "following_overview",
  displayName: "Following Overview",
  description: "Summarize which creators the connected Eden account follows.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The workspace context. Leave empty for your default workspace.",
      type: "combobox",
      required: false,
      optionsSource: "eden:workspaces",
      placeholder: "Default workspace",
    },
    { name: "platform", label: "Platform filter", description: "Optional platform to filter by.", type: "text", required: false, placeholder: "youtube" },
    { name: "limit", label: "Limit", description: "Maximum follows to return (1–100).", type: "number", required: false, placeholder: "25" },
  ],
  outputs: [
    { name: "totalFollowedCount", type: "number", description: "Total creators followed, or null.", nullable: true },
    { name: "follows", type: "array", description: "Followed creators (capped). Each: { id, platform, username, displayName, profileUrl, followerCount }." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 73,
  riskLevel: "low",
};
