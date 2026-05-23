import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:create_channel`.
 *
 * Mirrors `createChannel.schema.ts`:
 *   - `name`       (required) — 1..80 chars; Slack sanitizes server-side.
 *   - `isPrivate`  (required boolean) — Q11: public-vs-private is a
 *                                       workspace-visibility decision
 *                                       the author MUST own; NO hidden
 *                                       default (no defaultValue here).
 *
 * Required scope: `channels:manage` (or `groups:write` for private).
 *
 * Outputs mirror `createChannel.ts:return` — `{channel: object, id,
 * name, is_private}`.
 */
export const slackCreateChannelMeta: ActionMeta = {
  key: "slack:create_channel",
  provider: "slack",
  type: "create_channel",
  displayName: "Create Channel",
  description:
    "Create a new Slack channel via conversations.create. Slack sanitizes the name server-side (lowercase, [a-z0-9-_]). The Private toggle is required — no hidden default — because public vs. private is a workspace-visibility decision.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "name",
      label: "Channel name",
      description:
        "1..80 chars. Slack lowercases and strips invalid characters server-side (`a-z`, `0-9`, `-`, `_`).",
      type: "text",
      required: true,
      placeholder: "deals-q4",
    },
    {
      name: "isPrivate",
      label: "Private",
      description:
        "When enabled, the channel is private (only invited members can see it). No silent default — choose explicitly.",
      type: "boolean",
      required: true,
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "object",
      description:
        "Full Slack channel record as returned by conversations.create.",
    },
    {
      name: "id",
      type: "string",
      description: "Slack channel id for the newly created channel.",
    },
    {
      name: "name",
      type: "string",
      description: "Final channel name as Slack stored it (post-sanitization).",
    },
    {
      name: "is_private",
      type: "boolean",
      description: "True when the channel was created as private.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 180,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Creates a new Slack channel visible to the workspace.",
};
