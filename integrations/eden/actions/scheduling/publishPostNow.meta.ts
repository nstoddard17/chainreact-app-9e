import type { ActionMeta } from "@/contracts/actionMeta";
import { edenContentFields, edenPostOutputs, edenScheduleField, edenWorkspaceField } from "./_fields";

/**
 * Builder metadata for `eden:publish_post_now` (EDEN-6). HIGH risk + requiresConfirmation — an
 * immediate, public, irreversible publish. The builder surfaces a typed-confirmation before use,
 * and the React Agent catalog (metadata-driven) requires explicit intent to select it.
 */
export const edenPublishPostNowMeta: ActionMeta = {
  key: "eden:publish_post_now",
  provider: "eden",
  type: "publish_post_now",
  displayName: "Publish Post Now",
  description:
    "Immediately publish a social post PUBLICLY through Eden. This is a real publish — it cannot be unpublished from ChainReact. Use only when you explicitly want to post now.",
  category: "scheduling",
  requiresIntegration: true,
  fields: [edenWorkspaceField, edenScheduleField, ...edenContentFields()],
  outputs: edenPostOutputs,
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: true,
  displayOrder: 43,
  riskLevel: "high",
  riskDescription: "Publishes a PUBLIC social post immediately. Recipient-visible and irreversible from ChainReact.",
};
