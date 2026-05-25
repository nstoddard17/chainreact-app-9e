import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Facebook `send_message` ActionMeta — Slice 3.FACEBOOK-4.
 *
 * Sends a Messenger message AS the Page. The runtime field is `recipientId`
 * (NOT `conversationId`) — preserved exactly. It's backed by
 * `facebook:conversations` (dependsOn pageId), which emits
 * `conversationId:psid` values; the runtime extracts the PSID. The
 * `recipientId` output is a PSID (PII) and is marked sensitive.
 */
export const facebookSendMessageMeta: ActionMeta = {
  key: "facebook:send_message",
  provider: "facebook",
  type: "send_message",
  displayName: "Send Message",
  description: "Send a Messenger message from a Facebook Page to a recipient.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page",
      description: "The Facebook Page to send the message from.",
      type: "combobox",
      optionsSource: "facebook:pages",
      required: true,
      placeholder: "Select a Page",
    },
    {
      name: "recipientId",
      label: "Conversation",
      description:
        "The conversation to reply to. Pick a Page first to load its recent conversations.",
      type: "combobox",
      optionsSource: "facebook:conversations",
      dependsOn: "pageId",
      required: true,
      placeholder: "Select a conversation",
    },
    {
      name: "message",
      label: "Message",
      description: "The text of the message to send.",
      type: "textarea",
      required: true,
      placeholder: "Type your message…",
    },
  ],
  outputs: [
    { name: "messageId", type: "string", description: "Id of the sent message." },
    {
      name: "recipientId",
      type: "string",
      description: "Recipient identifier (echo).",
      sensitive: true,
    },
    { name: "pageId", type: "string", description: "Id of the Page that sent the message." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Sends a real message to a real person via Messenger. Not cleanly recallable, but not destructive.",
};
