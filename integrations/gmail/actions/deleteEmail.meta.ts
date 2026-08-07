import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:delete_email`.
 *
 * Mirrors `deleteEmail.schema.ts`. The `deleteMode` select is REQUIRED
 * with NO default (parity-gmail.md decision 2), and since
 * GOOGLE-OAUTH-REVIEW-READINESS-2 it offers ONLY `"trash"`: the former
 * `"permanent"` option required Google's full-mailbox
 * `https://mail.google.com/` scope (never requested — the mode never
 * worked) and is retired rather than expanding the OAuth surface. The
 * handler still recognizes a legacy saved `"permanent"` value and
 * rejects it with a clear error — it is never silently run as trash.
 *
 * Required scope: `gmail.modify`.
 *
 * Risk metadata stays `isDestructive`/`riskLevel: "high"`: trashing
 * removes the message from the mailbox and Gmail purges Trash after
 * ~30 days, so the effect can become irreversible (same posture as
 * microsoft-outlook:delete_email's retention-window delete).
 */
export const deleteEmailMeta: ActionMeta = {
  key: "gmail:delete_email",
  provider: "gmail",
  type: "delete_email",
  displayName: "Delete Email",
  description:
    "Move a single Gmail message to the trash folder (recoverable for about 30 days per Gmail TOS, then purged). Permanent immediate deletion is not supported — it would require the full-mailbox mail.google.com permission, which ChainReact does not request. Requires the gmail.modify scope.",
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
        "'Move to trash' moves the message to Gmail's trash folder (recoverable for about 30 days, then purged by Gmail). Explicit — no default.",
      type: "select",
      required: true,
      options: [{ value: "trash", label: "Move to trash (recoverable)" }],
    },
  ],
  outputs: [
    { name: "messageId", type: "string", description: "Echoes the input messageId." },
    { name: "deleteMode", type: "string", description: "Echoes the chosen mode ('trash')." },
    { name: "threadId", type: "string", description: "Gmail thread id of the trashed message." },
    { name: "labelIds", type: "array", description: "Label ids on the trashed message (includes TRASH)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 130,
  isDestructive: true,
  requiresConfirmation: false,
  riskLevel: "high",
  riskDescription:
    "Removes the message from the mailbox. Gmail purges trashed messages after about 30 days, after which recovery is impossible.",
};
