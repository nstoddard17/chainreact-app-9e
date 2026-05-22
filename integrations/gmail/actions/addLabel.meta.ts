import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:add_label`.
 *
 * Mirrors `addLabel.schema.ts`. Message-level only — thread-level
 * labeling requires an explicit targetType discriminator that the
 * schema doesn't accept today (parity-gmail.md Gmail 2.2 Commit 1
 * brief). Workflow authors who need to label multiple messages
 * compose a loop upstream.
 *
 * `labelIds` is a non-empty array of Gmail label ids — `string-array`
 * field type with chip input. Name-to-id lookup is intentionally NOT
 * supported (V1's `createIfNotExists` was a Q11 surprise); use
 * `create_label` to generate ids first.
 *
 * Required scope: `gmail.modify`.
 *
 * Outputs match `addLabel.ts:46-52` exactly.
 */
export const addLabelMeta: ActionMeta = {
  key: "gmail:add_label",
  provider: "gmail",
  type: "add_label",
  displayName: "Add Label",
  description:
    "Add Gmail labels to a single message. Labels must be supplied as Gmail label ids (no name-to-id lookup; use Create Label upstream). Requires the gmail.modify scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "messageId",
      label: "Message id",
      description:
        "Gmail message id to label. Source from a trigger payload or search_emails result.",
      type: "text",
      required: true,
    },
    {
      name: "labelIds",
      label: "Label ids to add",
      description:
        "One or more Gmail label ids to add. Press Enter or click Add to append each id. System labels use uppercase names (e.g. 'STARRED'); user labels use 'Label_<n>' ids.",
      type: "string-array",
      required: true,
      placeholder: "Label_12345",
    },
  ],
  outputs: [
    { name: "messageId", type: "string", description: "Echoes the input messageId." },
    { name: "threadId", type: "string", description: "Gmail thread id." },
    { name: "labelIds", type: "array", description: "Full set of label ids on the message after the add." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
};
