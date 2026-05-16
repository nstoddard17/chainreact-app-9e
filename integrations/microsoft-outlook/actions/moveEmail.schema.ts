import { z } from "zod";

/**
 * Resolved-config schema for the Microsoft Outlook move_email action.
 *
 * The engine pre-resolves all `{{...}}` references via the variable
 * resolver before dispatching the handler, so by the time this schema
 * runs every value is already a concrete string.
 *
 * Required-with-value:
 *   - `emailId` must be a non-empty string. Moving "" would be a Graph
 *     400; reject earlier with a schema error.
 *   - `destinationFolderId` must be a non-empty string. Accepts either a
 *     well-known folder name (`"inbox"`, `"sentitems"`, `"deleteditems"`,
 *     `"drafts"`, `"archive"`, `"junkemail"`, `"outbox"`) or a custom
 *     Graph folder id. The wrapper passes whatever was supplied verbatim;
 *     invalid names surface as Graph `ErrorItemNotFound` at runtime.
 *
 * Scope: requires `Mail.ReadWrite` (P-O1 manifest widening).
 *
 * Strict mode rejects unknown fields — matches send_email's policy.
 */
export const MoveEmailConfigSchema = z
  .object({
    /** Required. Graph message id of the message being moved. */
    emailId: z.string().min(1),
    /** Required. Destination folder — well-known name or custom id. */
    destinationFolderId: z.string().min(1),
  })
  .strict();

export type MoveEmailConfig = z.infer<typeof MoveEmailConfigSchema>;
