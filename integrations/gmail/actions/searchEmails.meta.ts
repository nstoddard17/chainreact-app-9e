import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:search_emails`.
 *
 * Mirrors `searchEmails.schema.ts`. The runtime schema is a Zod
 * discriminated union on `searchMode` — V2 metadata is a flat field
 * array, so the meta exposes `searchMode` as a select plus all fields
 * from both branches, each gated by `visibleWhen` to its mode
 * (CONFIG-UX sweep). The resolved-config Zod schema rejects fields
 * that don't belong to the chosen mode (strict union behavior); the
 * visibleWhen cascade clears other-mode values when the mode changes.
 *
 * Decisions:
 *   - `searchMode` defaults to `"filters"` (workflow-friendly path).
 *   - Filter text fields reject literal `"` per the schema's `q-builder`
 *     constraint — surface that constraint in the description. The
 *     server is the authoritative check; the renderer doesn't enforce.
 *   - `dateAfter` / `dateBefore` use strict YYYY/MM/DD per the schema's
 *     regex (Gmail q syntax form). Documented in description; the
 *     renderer is a plain text field (a date field would commit the
 *     wrong shape for Gmail q-syntax).
 *   - `labelIds` uses string-array chips backed by the `gmail:labels`
 *     option source with `allowManualEntry` (raw-id paste path kept).
 *
 * Required scope: `gmail.modify`.
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
    "Search Gmail messages. Two modes: 'Filters' composes a q-syntax query from named fields (workflow-friendly); 'Raw query' passes a q-syntax string directly (advanced). Fields not used by the chosen mode are rejected at save time. Requires the gmail.modify scope.",
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
    // Raw-query branch (visible only in 'Raw query' mode):
    {
      name: "query",
      label: "Query",
      description:
        "Raw Gmail q-syntax search string (advanced). See Google's q-syntax reference for the full grammar.",
      type: "text",
      required: false,
      advanced: true,
      visibleWhen: { field: "searchMode", valueIn: ["query"] },
      placeholder: "from:alice@example.com subject:invoice",
    },
    // Filters branch (visible only in 'Filters' mode):
    {
      name: "from",
      label: "From",
      description:
        "Sender address or domain (substring match). Literal '\"' characters are not allowed — use Raw query for quoted phrases.",
      type: "text",
      required: false,
      visibleWhen: { field: "searchMode", valueIn: ["filters"] },
      placeholder: "alice@example.com",
    },
    {
      name: "to",
      sensitivity: "recipient",
      label: "To",
      description: "Recipient address (substring match).",
      type: "text",
      required: false,
      visibleWhen: { field: "searchMode", valueIn: ["filters"] },
      placeholder: "bob@example.com",
    },
    {
      name: "subject",
      label: "Subject",
      description: "Text the subject line must contain.",
      type: "text",
      required: false,
      visibleWhen: { field: "searchMode", valueIn: ["filters"] },
      placeholder: "Invoice",
    },
    {
      name: "hasAttachment",
      label: "Has attachment",
      description:
        "Filter by attachment presence. Omit for no constraint.",
      type: "select",
      required: false,
      visibleWhen: { field: "searchMode", valueIn: ["filters"] },
      options: [
        { value: "yes", label: "Has attachment" },
        { value: "no", label: "No attachment" },
      ],
    },
    {
      name: "dateAfter",
      label: "Date after",
      description:
        "Only emails after this date. Type as YYYY/MM/DD (e.g. 2026/01/01).",
      type: "text",
      required: false,
      visibleWhen: { field: "searchMode", valueIn: ["filters"] },
      placeholder: "2026/01/01",
    },
    {
      name: "dateBefore",
      label: "Date before",
      description:
        "Only emails before this date. Type as YYYY/MM/DD (e.g. 2026/12/31).",
      type: "text",
      required: false,
      visibleWhen: { field: "searchMode", valueIn: ["filters"] },
      placeholder: "2026/12/31",
    },
    {
      name: "largerThan",
      label: "Larger than bytes",
      description:
        "Match messages larger than this size in bytes.",
      type: "number",
      required: false,
      advanced: true,
      visibleWhen: { field: "searchMode", valueIn: ["filters"] },
      numeric: { min: 1, integer: true, step: 1 },
    },
    {
      name: "smallerThan",
      label: "Smaller than bytes",
      description:
        "Match messages smaller than this size in bytes.",
      type: "number",
      required: false,
      advanced: true,
      visibleWhen: { field: "searchMode", valueIn: ["filters"] },
      numeric: { min: 1, integer: true, step: 1 },
    },
    {
      name: "labelIds",
      label: "Labels",
      description:
        "Only match emails carrying every one of these labels. Pick from your labels or paste a label ID.",
      type: "string-array",
      optionsSource: "gmail:labels",
      allowManualEntry: true,
      required: false,
      visibleWhen: { field: "searchMode", valueIn: ["filters"] },
      placeholder: "Search labels or paste a label ID",
    },
    {
      name: "hasWords",
      label: "Has words",
      description:
        "Words the email must contain.",
      type: "text",
      required: false,
      visibleWhen: { field: "searchMode", valueIn: ["filters"] },
      placeholder: "urgent",
    },
    {
      name: "doesntHaveWords",
      label: "Doesn't have words",
      description: "Words the email must NOT contain.",
      type: "text",
      required: false,
      visibleWhen: { field: "searchMode", valueIn: ["filters"] },
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
      advanced: true,
      numeric: { min: 1, max: 500, integer: true, step: 1 },
    },
    {
      name: "pageToken",
      label: "Page token",
      description:
        "Caller-driven pagination token from a previous result's nextPageToken. The handler does NOT auto-loop pages.",
      type: "text",
      required: false,
      advanced: true,
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
