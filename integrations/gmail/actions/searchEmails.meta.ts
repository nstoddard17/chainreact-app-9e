import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:search_emails`.
 *
 * Mirrors `searchEmails.schema.ts`. The runtime schema is a Zod
 * discriminated union on `searchMode` — V2 metadata is a flat field
 * array, so the meta exposes `searchMode` as a select plus all fields
 * from both branches. The resolved-config Zod schema rejects fields
 * that don't belong to the chosen mode (strict union behavior); the
 * description documents which fields apply per mode so authors aren't
 * surprised by save-time errors.
 *
 * Decisions:
 *   - `searchMode` defaults to `"filters"` (workflow-friendly path).
 *   - Filter text fields reject literal `"` per the schema's `q-builder`
 *     constraint — surface that constraint in the description. The
 *     server is the authoritative check; the renderer doesn't enforce.
 *   - `dateAfter` / `dateBefore` use strict YYYY/MM/DD per the schema's
 *     regex (Gmail q syntax form). Documented in description; the
 *     renderer is a plain text field today (no date-picker dependency).
 *   - `labelIds` uses string-array (free-text label-id chips). Same
 *     pattern as the Gmail new_email trigger meta's labelIds field.
 *
 * Required scope: `gmail.readonly`.
 *
 * Outputs match `searchEmails.ts:75-86` exactly. The `messages` array
 * carries per-message projections shaped by `projectMessage`.
 */
export const searchEmailsMeta: ActionMeta = {
  key: "gmail:search_emails",
  provider: "gmail",
  type: "search_emails",
  displayName: "Search Emails",
  description:
    "Search Gmail messages. Two modes: 'Filters' composes a q-syntax query from named fields (workflow-friendly); 'Raw query' passes a q-syntax string directly (advanced). Fields not used by the chosen mode are rejected at save time. Requires the gmail.readonly scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "searchMode",
      label: "Search mode",
      description:
        "'Filters' uses the named fields below; 'Raw query' uses the Query field. Mode-incompatible fields are rejected at save time.",
      type: "select",
      required: true,
      defaultValue: "filters",
      options: [
        { value: "filters", label: "Filters (named fields)" },
        { value: "query", label: "Raw query (q syntax)" },
      ],
    },
    // Raw-query branch:
    {
      name: "query",
      label: "Query (raw mode only)",
      description:
        "Raw Gmail q-syntax search string. Only used when Search Mode is 'Raw query'. See Google's q-syntax reference.",
      type: "text",
      required: false,
      placeholder: "from:alice@example.com subject:invoice",
    },
    // Filters branch:
    {
      name: "from",
      label: "From (filter mode)",
      description:
        "Sender address or domain (substring match). Filter mode only. Literal '\"' characters are not allowed — use Raw query for quoted phrases.",
      type: "text",
      required: false,
      placeholder: "alice@example.com",
    },
    {
      name: "to",
      label: "To (filter mode)",
      description: "Recipient address (substring match). Filter mode only.",
      type: "text",
      required: false,
      placeholder: "bob@example.com",
    },
    {
      name: "subject",
      label: "Subject (filter mode)",
      description: "Subject substring. Filter mode only.",
      type: "text",
      required: false,
      placeholder: "Invoice",
    },
    {
      name: "hasAttachment",
      label: "Has attachment (filter mode)",
      description:
        "Filter by attachment presence. Filter mode only. Omit for no constraint.",
      type: "select",
      required: false,
      options: [
        { value: "yes", label: "Has attachment" },
        { value: "no", label: "No attachment" },
      ],
    },
    {
      name: "dateAfter",
      label: "Date after (filter mode)",
      description:
        "Messages newer than this date. Filter mode only. Strict YYYY/MM/DD format (Gmail q-syntax).",
      type: "text",
      required: false,
      placeholder: "2026/01/01",
    },
    {
      name: "dateBefore",
      label: "Date before (filter mode)",
      description:
        "Messages older than this date. Filter mode only. Strict YYYY/MM/DD format.",
      type: "text",
      required: false,
      placeholder: "2026/12/31",
    },
    {
      name: "largerThan",
      label: "Larger than bytes (filter mode)",
      description:
        "Match messages larger than this size in bytes. Filter mode only.",
      type: "number",
      required: false,
      numeric: { min: 1, integer: true, step: 1 },
    },
    {
      name: "smallerThan",
      label: "Smaller than bytes (filter mode)",
      description:
        "Match messages smaller than this size in bytes. Filter mode only.",
      type: "number",
      required: false,
      numeric: { min: 1, integer: true, step: 1 },
    },
    {
      name: "labelIds",
      label: "Labels (filter mode)",
      description:
        "Gmail label ids to AND-match (each id becomes a label:<id> operator). Filter mode only. Press Enter or click Add for each id.",
      type: "string-array",
      required: false,
      placeholder: "Label_12345",
    },
    {
      name: "hasWords",
      label: "Has words (filter mode)",
      description:
        "Free-text inclusion clause. Filter mode only. Composed into the q-syntax verbatim.",
      type: "text",
      required: false,
      placeholder: "urgent",
    },
    {
      name: "doesntHaveWords",
      label: "Doesn't have words (filter mode)",
      description: "Free-text exclusion clause. Filter mode only.",
      type: "text",
      required: false,
      placeholder: "unsubscribe",
    },
    // Shared across both modes:
    {
      name: "maxResults",
      label: "Max results",
      description:
        "Cap on results returned by this call (1..500). Gmail defaults to 100 when omitted — V2 does NOT silently substitute, the cap matters for pagination.",
      type: "number",
      required: false,
      numeric: { min: 1, max: 500, integer: true, step: 1 },
    },
    {
      name: "pageToken",
      label: "Page token",
      description:
        "Caller-driven pagination token from a previous result's nextPageToken. The handler does NOT auto-loop pages.",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    { name: "query", type: "string", description: "Final q-syntax string used (verbatim in raw mode, composed in filter mode)." },
    {
      name: "messages",
      type: "array",
      description:
        "Array of per-message projections — each carries { messageId, threadId, subject, from, to, date, snippet, labelIds, internalDate }. Marked sensitive — per-row email addresses + snippet redact from the run-detail API and the variable picker preview (token wiring still works).",
      sensitive: true,
    },
    { name: "count", type: "number", description: "messages.length convenience." },
    { name: "nextPageToken", type: "string", description: "Pagination cursor for the next call. Absent when there are no more pages." },
    { name: "resultSizeEstimate", type: "number", description: "Gmail's estimate of total matching results across all pages." },
    { name: "hasMore", type: "boolean", description: "True when nextPageToken is set and non-empty." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
