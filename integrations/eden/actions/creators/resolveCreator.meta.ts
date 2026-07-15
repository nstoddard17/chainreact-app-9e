import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:resolve_creator` (EDEN-5). Read action. */
export const edenResolveCreatorMeta: ActionMeta = {
  key: "eden:resolve_creator",
  provider: "eden",
  type: "resolve_creator",
  displayName: "Resolve Creator",
  description: "Resolve a handle or name to matching creator profiles.",
  category: "data",
  requiresIntegration: true,
  fields: [
    { name: "query", label: "Handle or name", description: "The creator handle or name to look up.", type: "text", required: true, placeholder: "mkbhd" },
    {
      name: "platform",
      label: "Platform",
      description: "Optional platform hint.",
      type: "select",
      required: false,
      options: [
        { value: "youtube", label: "YouTube" },
        { value: "twitter", label: "X (Twitter)" },
        { value: "tiktok", label: "TikTok" },
        { value: "instagram", label: "Instagram" },
        { value: "linkedin", label: "LinkedIn" },
        { value: "threads", label: "Threads" },
        { value: "substack", label: "Substack" },
      ],
    },
    { name: "limit", label: "Limit", description: "Maximum matches to return (1–25).", type: "number", required: false, placeholder: "5" },
  ],
  outputs: [
    {
      name: "creators",
      type: "array",
      description: "Matched creators. Each: { id, platform, username, displayName, profileUrl, followerCount, totalContentCount, syncStatus }.",
    },
    { name: "count", type: "number", description: "Number of matches returned." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 71,
  riskLevel: "low",
};
