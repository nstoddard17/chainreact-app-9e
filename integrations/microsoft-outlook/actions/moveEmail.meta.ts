import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:move_email`.
 *
 * Mirrors `moveEmail.schema.ts`. `destinationFolderId` accepts either
 * a Graph well-known folder name (`inbox`, `sentitems`, `deleteditems`,
 * `drafts`, `archive`, `junkemail`, `outbox`) OR a custom folder id —
 * the wrapper passes whatever was supplied verbatim; invalid names
 * surface as Graph `ErrorItemNotFound` at runtime.
 *
 * Required scope: `Mail.ReadWrite` (P-O1 manifest widening).
 *
 * Outputs match `moveEmail.ts:51-58` exactly.
 */
export const outlookMoveEmailMeta: ActionMeta = {
  key: "microsoft-outlook:move_email",
  provider: "microsoft-outlook",
  type: "move_email",
  displayName: "Move Email",
  description:
    "Move an Outlook message to a different folder via Microsoft Graph's /move endpoint. Note: Graph returns a NEW message id for the moved item — the original id is no longer valid in the new folder. Requires the Mail.ReadWrite scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "emailId",
      label: "Email id",
      description:
        "Graph message id of the message being moved. Source from a trigger payload or fetch_emails result.",
      type: "text",
      required: true,
    },
    {
      name: "destinationFolderId",
      sensitivity: "recipient",
      label: "Destination folder",
      description:
        "Target folder. Accepts well-known names ('inbox', 'sentitems', 'deleteditems', 'drafts', 'archive', 'junkemail', 'outbox') OR a custom Graph folder id.",
      type: "text",
      required: true,
      placeholder: "archive",
    },
  ],
  outputs: [
    { name: "moved", type: "boolean", description: "Always true on success." },
    { name: "emailId", type: "string", description: "Echoes the input emailId (no longer valid for further operations — the message is now at newId)." },
    { name: "newId", type: "string", description: "NEW Graph message id assigned by Graph after the move. Use this for any downstream operations on the moved message." },
    { name: "destinationFolderId", type: "string", description: "Echoes the input destination folder." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Moves email between folders — recoverable but invisible until restored.",
};
