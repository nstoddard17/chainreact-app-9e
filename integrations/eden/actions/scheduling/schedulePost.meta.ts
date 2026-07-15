import type { ActionMeta } from "@/contracts/actionMeta";
import { edenContentFields, edenPostOutputs, edenScheduleField, edenWorkspaceField } from "./_fields";

/**
 * Builder metadata for `eden:schedule_post` (EDEN-6). HIGH risk — commits a PUBLIC post to
 * auto-publish at the scheduled time. The builder ranks/warns on high-risk actions.
 */
export const edenSchedulePostMeta: ActionMeta = {
  key: "eden:schedule_post",
  provider: "eden",
  type: "schedule_post",
  displayName: "Schedule Post",
  description:
    "Schedule a social post to publish PUBLICLY at a future time. This is a real scheduling write — the post will auto-publish unless you cancel it first.",
  category: "scheduling",
  requiresIntegration: true,
  fields: [
    edenWorkspaceField,
    edenScheduleField,
    {
      name: "scheduledAtIso",
      label: "Publish time",
      description: "When to publish. Must be in the future.",
      type: "datetime-utc",
      required: true,
    },
    ...edenContentFields(),
  ],
  outputs: edenPostOutputs,
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 42,
  riskLevel: "high",
  riskDescription: "Queues a PUBLIC social post to auto-publish at the scheduled time. Cancel before then to stop it.",
};
