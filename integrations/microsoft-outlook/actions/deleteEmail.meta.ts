import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:delete_email`.
 *
 * Mirrors `deleteEmail.schema.ts`. **`deleteMode` is required with NO
 * default** per Outlook Phase 2 Q11 — V1 silently defaulted to "move
 * to Deleted Items"; V2 forces explicit choice because the two paths
 * have meaningfully different consequences.
 *
 * V1 also accepted boolean / boolean-string `permanentDelete` shapes.
 * V2's enum is strict — those legacy inputs are rejected at the schema
 * layer.
 *
 * Required scope: `Mail.ReadWrite` (P-O1 manifest widening).
 *
 * Outputs match `deleteEmail.ts:63-69` exactly.
 */
export const outlookDeleteEmailMeta: ActionMeta = {
  key: "microsoft-outlook:delete_email",
  provider: "microsoft-outlook",
  type: "delete_email",
  displayName: "Delete Email",
  description:
    "Delete an Outlook message. Choose 'Move to Deleted Items' (reversible) or 'Permanent delete' (effectively irreversible — recoverable-items retention window may apply but treat as unrecoverable). NO default per Outlook Phase 2 Q11 — V2 forces explicit choice. Requires the Mail.ReadWrite scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "emailId",
      label: "Email id",
      description:
        "Graph message id of the message being deleted. Source from a trigger payload or fetch_emails result.",
      type: "text",
      required: true,
    },
    {
      name: "deleteMode",
      label: "Delete mode",
      description:
        "'Move to Deleted Items' moves the message to Outlook's Deleted Items folder (reversible). 'Permanent delete' removes the message from the mailbox entirely (recoverable-items retention may apply but treat as unrecoverable). No default — choose explicitly.",
      type: "select",
      required: true,
      options: [
        { value: "trash", label: "Move to Deleted Items (reversible)" },
        { value: "permanent", label: "Permanent delete (irreversible)" },
      ],
    },
  ],
  outputs: [
    { name: "deleted", type: "boolean", description: "Always true on success." },
    { name: "emailId", type: "string", description: "Echoes the input emailId." },
    { name: "mode", type: "string", description: "Echoes the chosen mode ('trash' or 'permanent')." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
};
