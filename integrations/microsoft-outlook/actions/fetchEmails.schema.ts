import { z } from "zod";

/**
 * Resolved-config schema for the Microsoft Outlook fetch_emails action.
 *
 * The engine pre-resolves all `{{...}}` references via the variable
 * resolver before dispatching the handler, so by the time this schema
 * runs every value is already a concrete primitive.
 *
 * Outlook Mail 2.2 audit D-OM1 — V1-shape: optional `folderId` + `query`
 * + `startDate` + `endDate` + `maxResults`. Ship V1-shape now;
 * cross-provider unification with Gmail's `searchEmails` can come
 * later as a Phase 5 / 7 cleanup if needed.
 *
 * Field semantics:
 *   - `folderId`: when absent → /me/messages (cross-folder). When set →
 *     /me/mailFolders/{folderId}/messages. Custom folder ids OR
 *     well-known names (`inbox`, `sentitems`, `drafts`, etc.). V1 had
 *     a special-case for `"inbox"` (treated as "no folder filter") —
 *     V2 drops that quirk; if you want cross-folder, omit `folderId`.
 *   - `query`: maps to Graph `$search`. Mutually exclusive with date
 *     `$filter` at Graph level — the wrapper routes around this; when
 *     `query` is set, dates are applied client-side after the response.
 *   - `startDate` / `endDate`: ISO 8601 strings. Server-side `$filter`
 *     when no query; client-side filter when query is set.
 *   - `maxResults`: bounded `1..50` (Graph $top ceiling preserved).
 *     Default `10` (matches V1 user expectation; non-high-risk schema
 *     default per Q11 — bounds an output, doesn't drive a side effect).
 *
 * Paging: single-page only. Workflows that need >50 results compose
 * multiple fetch_emails calls with date-window slicing. `@odata.nextLink`
 * is intentionally NOT followed.
 *
 * Scope: requires `Mail.Read` (already in manifest from Slice 6).
 *
 * Strict mode rejects unknown fields — matches send_email's policy.
 */
export const FetchEmailsConfigSchema = z
  .object({
    /** Optional. Mail folder id; when absent, cross-folder /me/messages. */
    folderId: z.string().min(1).optional(),
    /**
     * Optional. Graph $search query. Empty / whitespace-only treated
     * as "no query" by the handler (matches V1).
     */
    query: z.string().optional(),
    /** Optional. ISO 8601 lower bound on receivedDateTime. */
    startDate: z.string().min(1).optional(),
    /** Optional. ISO 8601 upper bound on receivedDateTime. */
    endDate: z.string().min(1).optional(),
    /**
     * Optional. Bounded 1..50. Default 10. Non-high-risk schema default
     * (bounds output count; no side effect).
     */
    maxResults: z.number().int().min(1).max(50).default(10),
  })
  .strict();

export type FetchEmailsConfig = z.infer<typeof FetchEmailsConfigSchema>;
