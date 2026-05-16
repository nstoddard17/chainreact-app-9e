import { z } from "zod";

/**
 * Resolved-config schema for the Microsoft Outlook delete_email action.
 *
 * The engine pre-resolves all `{{...}}` references via the variable
 * resolver before dispatching the handler, so by the time this schema
 * runs every value is already a concrete string.
 *
 * Q11 — REQUIRED with no hidden defaults:
 *   - `deleteMode`: V1 silently defaults `permanentDelete = false` (i.e.
 *     "move to Deleted Items"). That is a destructive hidden default —
 *     two of the deletion modes have very different consequences:
 *       - `"trash"` → reversible: message moves to the Deleted Items
 *         folder; user can restore.
 *       - `"permanent"` → irreversible: message is deleted from the
 *         mailbox entirely (recoverable-items retention window may still
 *         apply, but workflows should treat as unrecoverable).
 *     V2 forces the workflow author to choose explicitly.
 *
 * Required-with-value:
 *   - `emailId` must be a non-empty string. Deleting "" would be a Graph
 *     400; reject earlier with a schema error.
 *
 * Strict mode rejects unknown fields — matches send_email's policy.
 *
 * V1-parity note: V1 also accepted `permanentDelete: 'true'` / `'false'`
 * string coercions. V2's enum is strict — boolean / boolean-string inputs
 * are rejected. Workflows that wired V1's boolean shape need migration
 * tooling (out of scope for the slice).
 */
export const DeleteEmailConfigSchema = z
  .object({
    /** Required. Graph message id of the message being deleted. */
    emailId: z.string().min(1),
    /** Q11 required: no hidden default for destructive choice. */
    deleteMode: z.enum(["trash", "permanent"]),
  })
  .strict();

export type DeleteEmailConfig = z.infer<typeof DeleteEmailConfigSchema>;
