import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:remove_label`.
 *
 * Mirrors `removeLabel.schema.ts` — same inputs as `add_label`, the
 * inverse of the operation. The handler routes `labelIds` into
 * `users.messages.modify`'s `removeLabelIds` field.
 *
 * Required scope: `gmail.modify`.
 *
 * Outputs match `removeLabel.ts:36-42` exactly.
 */
export const removeLabelMeta: ActionMeta = {
  key: "gmail:remove_label",
  provider: "gmail",
  type: "remove_label",
  displayName: "Remove Label",
  description:
    "Remove Gmail labels from a single message. Labels must be supplied as Gmail label ids. Requires the gmail.modify scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "messageId",
      label: "Message id",
      description:
        "Gmail message id whose labels are being removed. Source from a trigger payload or search_emails result.",
      type: "text",
      required: true,
    },
    {
      name: "labelIds",
      label: "Labels to remove",
      description:
        "Pick one or more Gmail labels to remove (stored as label ids), or paste a raw id. System labels use uppercase names (e.g. 'STARRED'); user labels use 'Label_<n>' ids.",
      type: "string-array",
      optionsSource: "gmail:labels",
      allowManualEntry: true,
      required: true,
      placeholder: "Search labels or paste a label ID",
    },
  ],
  outputs: [
    { name: "messageId", type: "string", description: "Echoes the input messageId." },
    { name: "threadId", type: "string", description: "Gmail thread id." },
    { name: "labelIds", type: "array", description: "Full set of label ids on the message after the remove." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
