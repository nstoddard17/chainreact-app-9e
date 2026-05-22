import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:mark_as_read`.
 *
 * Mirrors `markAsRead.schema.ts`. Removes the `UNREAD` system label
 * from a single message via `users.messages.modify`. Single-message
 * only — workflow authors needing batch operation loop upstream.
 *
 * Required scope: `gmail.modify`.
 *
 * Outputs match `markAsRead.ts:35-42` exactly.
 */
export const markAsReadMeta: ActionMeta = {
  key: "gmail:mark_as_read",
  provider: "gmail",
  type: "mark_as_read",
  displayName: "Mark Email as Read",
  description:
    "Mark a single Gmail message as read (removes the UNREAD system label). Requires the gmail.modify scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "messageId",
      label: "Message id",
      description: "Gmail message id to mark as read.",
      type: "text",
      required: true,
    },
  ],
  outputs: [
    { name: "messageId", type: "string", description: "Echoes the input messageId." },
    { name: "threadId", type: "string", description: "Gmail thread id." },
    { name: "labelIds", type: "array", description: "Full set of label ids on the message after the modification." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 100,
};
