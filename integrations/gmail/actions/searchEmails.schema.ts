import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `search_emails` action.
 *
 * Gmail 2.2 Commit 3 — folds V1's separate `advancedSearch` action
 * into a single `search_emails` action with a discriminated
 * `searchMode` union (parity-gmail.md decision 1):
 *   - `searchMode: "query"`   → raw Gmail q-syntax string (advanced
 *     authors / programmatic use).
 *   - `searchMode: "filters"` → named fields composed into q syntax
 *     by `buildSearchQuery` (workflow-builder UX).
 *
 * Both modes share: optional `maxResults` (1..500; Gmail's default
 * is 100 when omitted — V2 does NOT silently substitute) and
 * optional `pageToken` (caller-driven pagination — the handler does
 * NOT auto-loop pages).
 *
 * Filter fields ported (per brief + parity-gmail.md):
 *   - `from` / `to` / `subject` — substring/term match.
 *   - `hasAttachment: "yes" | "no"` — explicit; omit for no constraint.
 *   - `dateAfter` / `dateBefore` — `YYYY/MM/DD` strict format
 *     (matches Gmail q syntax; no silent date coercion per G-R5).
 *   - `largerThan` / `smallerThan` — positive integer bytes.
 *   - `labelIds` — non-empty array of label IDs; AND-joined as
 *     `label:<id>` operators.
 *   - `hasWords` / `doesntHaveWords` — free-text inclusion /
 *     exclusion clauses.
 *
 * V1 filter fields intentionally NOT ported in this commit:
 *   - `isRead` / `isStarred` enum filters.
 *   - `attachmentName` (filename:).
 *   - `dateRange` presets ("today", "last_7_days", etc.).
 *   - V1's broken `threadId:` operator.
 *
 * Scope requirement: `gmail.readonly` (already shipped in Slice 2).
 *
 * `.strict()` rejects unknown fields on both union branches —
 * neither V1's `customQuery` (folded into `query`) nor V1's
 * `searchQuery` alias is accepted.
 *
 * Quoted-string rule: text fields with literal `"` are rejected so
 * the query builder doesn't have to escape inner quotes. Workflow
 * authors who need quote characters use raw `searchMode: "query"`.
 */

const MaxResultsSchema = z
  .number()
  .int()
  .min(1, "maxResults must be at least 1.")
  .max(500, "maxResults must be at most 500 (Gmail API cap).")
  .optional();

// YYYY/MM/DD strict format — Gmail q syntax accepts this verbatim.
const GmailDateSchema = z
  .string()
  .regex(
    /^\d{4}\/\d{2}\/\d{2}$/,
    'Date must be in YYYY/MM/DD format (Gmail q-syntax form).',
  );

const SizeSchema = z
  .number()
  .int()
  .min(1, "Size must be a positive integer (bytes).");

// Filter text fields: non-empty, no literal `"` characters
// (the q-builder doesn't escape inner quotes; the discriminated
// "query" mode handles arbitrary input).
const FilterTextSchema = z
  .string()
  .min(1)
  .refine((s) => !s.includes('"'), {
    message:
      'Filter values may not contain `"` characters. Use searchMode: "query" for raw q syntax.',
  });

export const QueryModeConfigSchema = z
  .object({
    searchMode: z.literal("query"),
    query: z.string().min(1, "query is required in searchMode: 'query'."),
    maxResults: MaxResultsSchema,
    pageToken: z.string().min(1).optional(),
  })
  .strict();
export type QueryModeConfig = z.infer<typeof QueryModeConfigSchema>;

export const FiltersModeConfigSchema = z
  .object({
    searchMode: z.literal("filters"),
    from: FilterTextSchema.optional(),
    to: FilterTextSchema.optional(),
    subject: FilterTextSchema.optional(),
    hasAttachment: z.enum(["yes", "no"]).optional(),
    dateAfter: GmailDateSchema.optional(),
    dateBefore: GmailDateSchema.optional(),
    largerThan: SizeSchema.optional(),
    smallerThan: SizeSchema.optional(),
    labelIds: z.array(z.string().min(1)).min(1).optional(),
    hasWords: z.string().min(1).optional(),
    doesntHaveWords: z.string().min(1).optional(),
    maxResults: MaxResultsSchema,
    pageToken: z.string().min(1).optional(),
  })
  .strict();
export type FiltersModeConfig = z.infer<typeof FiltersModeConfigSchema>;

export const SearchEmailsConfigSchema = z.discriminatedUnion("searchMode", [
  QueryModeConfigSchema,
  FiltersModeConfigSchema,
]);
export type SearchEmailsConfig = z.infer<typeof SearchEmailsConfigSchema>;
