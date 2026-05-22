import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:archive_email`.
 *
 * Mirrors `archiveEmail.schema.ts`. Removes the `INBOX` system label
 * from a single message via `users.messages.modify` — Gmail's
 * equivalent of archiving.
 *
 * Required scope: `gmail.modify`.
 *
 * Outputs match `archiveEmail.ts:34-41` exactly.
 */
export const archiveEmailMeta: ActionMeta = {
  key: "gmail:archive_email",
  provider: "gmail",
  type: "archive_email",
  displayName: "Archive Email",
  description:
    "Archive a single Gmail message (removes the INBOX system label). The message remains searchable; it is not deleted. Requires the gmail.modify scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "messageId",
      label: "Message id",
      description: "Gmail message id to archive.",
      type: "text",
      required: true,
    },
  ],
  outputs: [
    { name: "messageId", type: "string", description: "Echoes the input messageId." },
    { name: "threadId", type: "string", description: "Gmail thread id." },
    { name: "labelIds", type: "array", description: "Full set of label ids on the message after archiving." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 120,
};
