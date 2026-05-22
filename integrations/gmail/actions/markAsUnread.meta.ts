import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:mark_as_unread`.
 *
 * Mirrors `markAsUnread.schema.ts`. Adds the `UNREAD` system label to
 * a single message via `users.messages.modify`. Inverse of
 * `mark_as_read`.
 *
 * Required scope: `gmail.modify`.
 *
 * Outputs match `markAsUnread.ts:30-37` exactly.
 */
export const markAsUnreadMeta: ActionMeta = {
  key: "gmail:mark_as_unread",
  provider: "gmail",
  type: "mark_as_unread",
  displayName: "Mark Email as Unread",
  description:
    "Mark a single Gmail message as unread (adds the UNREAD system label). Requires the gmail.modify scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "messageId",
      label: "Message id",
      description: "Gmail message id to mark as unread.",
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
  displayOrder: 110,
};
