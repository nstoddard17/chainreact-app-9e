import type { ActionMeta } from "@/contracts/actionMeta";
import { edenContentFields, edenPostOutputs } from "./_fields";

const contentFields = edenContentFields({ textLabel: "New post text" })
  // On edit, text/timezone/idempotency behave differently: text is optional, timezone/idempotency
  // are not part of the update tool. Keep platforms/text/segments/media/youtubeTitle only.
  .filter((f) => ["platforms", "text", "segments", "media", "youtubeTitle"].includes(f.name))
  .map((f) => (f.name === "text" ? { ...f, required: false, description: "Replacement post body. Leave empty to keep the current text." } : f));

/** Builder metadata for `eden:update_scheduled_post` (EDEN-6). Reversible pre-publish edit. */
export const edenUpdateScheduledPostMeta: ActionMeta = {
  key: "eden:update_scheduled_post",
  provider: "eden",
  type: "update_scheduled_post",
  displayName: "Update Scheduled Post",
  description:
    "Edit the content of an existing Eden draft or scheduled post by id. Cannot edit a post that is already publishing or posted.",
  category: "scheduling",
  requiresIntegration: true,
  fields: [
    {
      name: "postId",
      label: "Scheduled post",
      description: "The draft or scheduled post to edit. Pick from your queue, or paste a post id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:scheduled_posts",
      allowManualEntry: true,
      placeholder: "Select a post, or paste a post id",
    },
    {
      name: "scheduleId",
      label: "Schedule guard",
      description: "Optional. Rejects the edit if the post belongs to a different schedule.",
      type: "combobox",
      required: false,
      optionsSource: "eden:schedules",
      advanced: true,
    },
    ...contentFields,
  ],
  outputs: edenPostOutputs,
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 44,
  riskLevel: "medium",
  riskDescription: "Rewrites an existing draft/scheduled post. Reversible while the post has not published.",
};
