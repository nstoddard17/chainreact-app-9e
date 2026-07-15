import type { ActionMeta } from "@/contracts/actionMeta";

/** Builder metadata for `eden:cancel_scheduled_post` (EDEN-6). Removes a post from the queue. */
export const edenCancelScheduledPostMeta: ActionMeta = {
  key: "eden:cancel_scheduled_post",
  provider: "eden",
  type: "cancel_scheduled_post",
  displayName: "Cancel Scheduled Post",
  description:
    "Cancel a scheduled post or delete a draft in Eden by id, removing it from the publish queue. Cannot cancel a post that is already publishing or posted.",
  category: "scheduling",
  requiresIntegration: true,
  fields: [
    {
      name: "postId",
      label: "Scheduled post",
      description: "The scheduled post or draft to cancel. Pick from your queue, or paste a post id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:scheduled_posts",
      allowManualEntry: true,
      placeholder: "Select a post, or paste a post id",
    },
    {
      name: "scheduleId",
      label: "Schedule guard",
      description: "Optional. Rejects the cancel if the post belongs to a different schedule.",
      type: "combobox",
      required: false,
      optionsSource: "eden:schedules",
      advanced: true,
    },
  ],
  outputs: [
    { name: "postId", type: "string", description: "The cancelled post's id." },
    { name: "status", type: "string", description: "Provider status after cancel, or null.", nullable: true },
    { name: "cancelled", type: "boolean", description: "Whether Eden confirmed the cancellation." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 47,
  riskLevel: "medium",
  riskDescription: "Removes a post from the publish queue (or deletes a draft). Prevents a scheduled post from publishing.",
};
