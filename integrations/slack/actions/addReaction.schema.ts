import { z } from "zod";

/**
 * Resolved-config schema for the Slack add_reaction action.
 *
 * `reaction` accepts either the bare emoji name (`thumbsup`) or the
 * colon-wrapped form (`:thumbsup:`). The handler runs
 * `normalizeReactionName` at the handler boundary to strip outer
 * colons; Slack's API expects the bare form.
 *
 * Field naming uses `reaction` (matching Slack's `reaction_added`
 * trigger payload field name — workflow templates can pass
 * `{{trigger.payload.reaction}}` directly).
 */
export const AddReactionConfigSchema = z.object({
  channel: z.string().min(1, "Slack channel is required."),
  ts: z.string().min(1, "Slack message timestamp (ts) is required."),
  reaction: z.string().min(1, "Reaction emoji name is required."),
});
export type AddReactionConfig = z.infer<typeof AddReactionConfigSchema>;
