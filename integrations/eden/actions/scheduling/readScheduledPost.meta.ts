import type { ActionMeta } from "@/contracts/actionMeta";
import { edenWorkspaceField } from "./_fields";

/** Builder metadata for `eden:read_scheduled_post` (EDEN-6). Read action. */
export const edenReadScheduledPostMeta: ActionMeta = {
  key: "eden:read_scheduled_post",
  provider: "eden",
  type: "read_scheduled_post",
  displayName: "Read Scheduled Post",
  description: "Read the full detail of one Eden scheduled post or draft by id (content, platforms, time, status).",
  category: "scheduling",
  requiresIntegration: true,
  fields: [
    edenWorkspaceField,
    {
      name: "postId",
      label: "Scheduled post",
      description: "The scheduled post or draft to read. Pick from your queue, or paste a post id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:scheduled_posts",
      allowManualEntry: true,
      placeholder: "Select a post, or paste a post id",
    },
  ],
  outputs: [
    { name: "found", type: "boolean", description: "Whether a post with that id exists." },
    { name: "id", type: "string", description: "The post id, or null when not found.", nullable: true },
    { name: "status", type: "string", description: "Provider status, or null.", nullable: true },
    { name: "scheduleId", type: "string", description: "The schedule the post belongs to, or null.", nullable: true },
    { name: "timezone", type: "string", description: "The post's timezone, or null.", nullable: true },
    { name: "platforms", type: "array", description: "The target platform ids." },
    { name: "scheduledFor", type: "number", description: "Publish time as epoch ms, or null.", nullable: true },
    { name: "scheduledAtIso", type: "string", description: "Publish time as ISO-8601, or null.", nullable: true },
    { name: "text", type: "string", description: "The post body, or null.", nullable: true, sensitive: true },
    { name: "mediaCount", type: "number", description: "Number of attached media assets." },
    { name: "hasFirstComment", type: "boolean", description: "Whether an auto first-comment is attached." },
    { name: "errorMessage", type: "string", description: "Publish failure detail for a failed post, or null.", nullable: true },
    { name: "targets", type: "array", description: "Per-platform targets: { platform, kind, status }." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 41,
  riskLevel: "low",
};
