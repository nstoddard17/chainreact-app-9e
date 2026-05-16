import { z } from "zod";

/**
 * Resolved-config schema for the Microsoft Outlook add_categories action.
 *
 * The engine pre-resolves all `{{...}}` references via the variable
 * resolver before dispatching the handler, so by the time this schema
 * runs every value is already a concrete string or array.
 *
 * Required-with-value:
 *   - `emailId` must be a non-empty string. Patching "" would be a Graph
 *     400; reject earlier with a schema error.
 *   - `categories` accepts EITHER a CSV string OR an array of strings.
 *     `parseCsvList` (shared with Q7) flattens both shapes into a flat
 *     list. The `.min(1)` on each branch enforces "at least one input
 *     value"; the handler additionally enforces "at least one category
 *     post-parse" because whitespace-only CSV (`"   ,  "`) passes the
 *     schema but parses to `[]`.
 *
 * IMPORTANT — V1-parity PATCH semantics:
 *   This action PATCH-replaces the message's full `categories[]`. Adding
 *   one category to an email with three existing categories REPLACES
 *   all four with the one. Both V1 and V2 follow this — Graph's PATCH
 *   semantics on collection-valued properties are replace, not append.
 *   Documented prominently in the handler doc-comment so workflow
 *   authors aren't surprised.
 *
 * Scope: requires `Mail.ReadWrite` (P-O1 manifest widening).
 *
 * Strict mode rejects unknown fields — matches send_email's policy.
 */
export const AddCategoriesConfigSchema = z
  .object({
    /** Required. Graph message id of the message being categorized. */
    emailId: z.string().min(1),
    /**
     * Required. CSV string OR array of strings; min-1 in either case.
     * Whitespace-only CSV passes schema but the handler rejects post-parse.
     */
    categories: z.union([
      z.string().min(1),
      z.array(z.string()).min(1),
    ]),
  })
  .strict();

export type AddCategoriesConfig = z.infer<typeof AddCategoriesConfigSchema>;
