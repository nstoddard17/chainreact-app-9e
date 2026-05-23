import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `slack:send_direct_message`.
 *
 * Mirrors `sendDirectMessage.schema.ts`:
 *   - `userId` (required, regex `^U[A-Z0-9]+$`) — Slack user id.
 *   - `text`   (required) — message body (textarea).
 *   - `threadTs` (optional) — thread reply within the DM channel.
 *
 * User-id field stays `text` for v1 (Slice 3.35); a future
 * `slack:users` resolver slice (3.39+) will flip this to a combobox
 * sourced picker. See `docs/slices/phase-3/slack-action-metadata-plan.md`
 * §4.2 for the rationale.
 *
 * Required scopes: `chat:write`, `im:write` (already in the Slack
 * manifest).
 *
 * Outputs match `sendDirectMessage.ts:return` exactly: `channel`
 * (DM channel id), `ts`, `userId` (echoed), and the Slack `message`
 * payload.
 */
export const slackSendDirectMessageMeta: ActionMeta = {
  key: "slack:send_direct_message",
  provider: "slack",
  type: "send_direct_message",
  displayName: "Send Direct Message",
  description:
    "Open a DM channel to a Slack user via conversations.open then post the message via chat.postMessage. Optionally posts as a thread reply when Thread Timestamp is provided. Requires the Slack chat:write + im:write scopes.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "userId",
      label: "User id",
      description:
        "Slack user id (U-prefixed). Wire from an upstream Slack action / trigger payload (e.g. `{{trigger.user}}`, `{{slack:get_user_info.user.id}}`).",
      type: "text",
      required: true,
      placeholder: "U01ABC23DEF",
    },
    {
      name: "text",
      label: "Message",
      description:
        "Message body posted to the DM. Supports Slack mrkdwn formatting.",
      type: "textarea",
      required: true,
      placeholder: "Hi there!",
    },
    {
      name: "threadTs",
      label: "Thread timestamp",
      description:
        "Optional Slack message timestamp — post as a thread reply within the DM. Wired from an upstream Slack message action's `ts` output.",
      type: "text",
      required: false,
      placeholder: "1700000000.000100",
    },
  ],
  outputs: [
    {
      name: "channel",
      type: "string",
      description:
        "DM channel id the message was posted to (D-prefixed). Use as `channel` on follow-up DM actions.",
    },
    {
      name: "ts",
      type: "string",
      description: "Slack message timestamp.",
    },
    {
      name: "userId",
      type: "string",
      description: "Echo of the input user id for downstream variable wiring.",
    },
    {
      name: "message",
      type: "object",
      description:
        "Slack message payload object as returned by chat.postMessage. Drill into specific fields via the variable picker.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Posts a Slack DM — visible immediately to the recipient.",
};
