import type { ActionMeta } from "@/contracts/actionMeta";
import { edenPostOutputs } from "./_fields";

/** Builder metadata for `eden:reschedule_post` (EDEN-6). Reversible time change. */
export const edenReschedulePostMeta: ActionMeta = {
  key: "eden:reschedule_post",
  provider: "eden",
  type: "reschedule_post",
  displayName: "Reschedule Post",
  description: "Change the publish time of an existing Eden draft or scheduled post (content unchanged).",
  category: "scheduling",
  requiresIntegration: true,
  fields: [
    {
      name: "postId",
      label: "Scheduled post",
      description: "The draft or scheduled post to move. Pick from your queue, or paste a post id.",
      type: "combobox",
      required: true,
      optionsSource: "eden:scheduled_posts",
      allowManualEntry: true,
      placeholder: "Select a post, or paste a post id",
    },
    {
      name: "scheduledAtIso",
      label: "New publish time",
      description: "The new publish time. Must be in the future.",
      type: "datetime-utc",
      required: true,
    },
    {
      name: "timezone",
      label: "Timezone",
      description: "Optional timezone override for the new time.",
      type: "timezone",
      required: false,
    },
    {
      name: "scheduleId",
      label: "Schedule guard",
      description: "Optional. Rejects if the post belongs to a different schedule.",
      type: "combobox",
      required: false,
      optionsSource: "eden:schedules",
      advanced: true,
    },
  ],
  outputs: edenPostOutputs,
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 45,
  riskLevel: "medium",
  riskDescription: "Moves the publish time of an existing post. Reversible while the post has not published.",
};
