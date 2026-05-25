import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:delete_email`.
 *
 * Mirrors `deleteEmail.schema.ts`. The `deleteMode` enum is REQUIRED
 * with NO default per parity-gmail.md decision 2 — the two modes have
 * meaningfully different consequences and the workflow author must
 * choose explicitly. V1 silently defaulted to `trash` via a boolean;
 * V2 surfaces the user-visible consequence at config time.
 *
 * Required scope: `gmail.modify`.
 *
 * Outputs differ by mode:
 *   - `trash`: returns Gmail's `messages.trash` response (messageId,
 *     threadId, labelIds, deleteMode='trash'). See deleteEmail.ts:45-52.
 *   - `permanent`: returns only `messageId` + `deleteMode='permanent'`
 *     (Gmail's `messages.delete` returns 204 No Content). See
 *     deleteEmail.ts:67-72.
 *
 * The `outputs[]` below describes the trash path (richer); the
 * permanent path's outputs are a subset. Both modes share the
 * `messageId` + `deleteMode` outputs.
 */
export const deleteEmailMeta: ActionMeta = {
  key: "gmail:delete_email",
  provider: "gmail",
  type: "delete_email",
  displayName: "Delete Email",
  description:
    "Delete a single Gmail message. Choose 'Move to trash' (recoverable for 30 days per Gmail TOS) or 'Permanent delete' (irreversible). No silent default — explicit mode required. Requires the gmail.modify scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "messageId",
      label: "Message id",
      description: "Gmail message id to delete.",
      type: "text",
      required: true,
    },
    {
      name: "deleteMode",
      label: "Delete mode",
      description:
        "'Move to trash' moves the message to Gmail's trash folder (recoverable for 30 days). 'Permanent delete' removes the message immediately and irreversibly. No default — choose explicitly.",
      type: "select",
      required: true,
      options: [
        { value: "trash", label: "Move to trash (recoverable)" },
        { value: "permanent", label: "Permanent delete (irreversible)" },
      ],
    },
  ],
  outputs: [
    { name: "messageId", type: "string", description: "Echoes the input messageId." },
    { name: "deleteMode", type: "string", description: "Echoes the chosen mode ('trash' or 'permanent')." },
    { name: "threadId", type: "string", description: "Gmail thread id. Only present when deleteMode='trash' — Gmail's permanent delete returns no body." },
    { name: "labelIds", type: "array", description: "Label ids on the trashed message. Only present when deleteMode='trash'." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 130,
  isDestructive: true,
  requiresConfirmation: false,
  riskLevel: "high",
  riskDescription: "Permanent deletion. Gmail does not retain a recoverable copy after this call.",
};
