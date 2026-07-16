import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-outlook:fetch_emails`.
 *
 * Mirrors `fetchEmails.schema.ts`. Single-page surface (the handler does
 * NOT follow @odata.nextLink — workflows that need >50 results compose
 * multiple calls with date-window slicing). `maxResults` carries the
 * schema's `default(10)` non-high-risk default (bounds output count, no
 * side effect).
 *
 * `folderId` accepts well-known names (`inbox`, `sentitems`, `drafts`,
 * `archive`, `junkemail`, `deleteditems`, `outbox`) OR custom Graph
 * folder ids — the wrapper passes whatever was supplied verbatim. V1's
 * special-case for "inbox" treating it as "no folder filter" is
 * intentionally dropped; if you want cross-folder, omit the field.
 *
 * `query` maps to Graph $search; mutually exclusive with date $filter
 * at the Graph level — the wrapper routes around this by applying
 * dates client-side when query is set.
 *
 * Required scope: `Mail.Read`.
 *
 * Outputs match `fetchEmails.ts:98-103` exactly. The `messages` array
 * carries per-message projections shaped by `projectMessage` —
 * documented in the output description rather than nested fields[]
 * because OutputMeta doesn't support array-item shape today.
 */
export const outlookFetchEmailsMeta: ActionMeta = {
  key: "microsoft-outlook:fetch_emails",
  provider: "microsoft-outlook",
  type: "fetch_emails",
  displayName: "Fetch Emails",
  description:
    "Fetch a page of Outlook messages via Microsoft Graph. Optionally narrow by folder, search query, or date window. Returns up to 50 messages per call (Graph $top ceiling); pagination is not followed automatically — compose multiple calls with date-window slicing for larger result sets. Requires the Mail.Read scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "folderId",
      label: "Folder",
      description:
        "Optional. Pick a mail folder, or paste a folder ID or well-known name ('inbox', 'sentitems', 'drafts', 'archive', 'junkemail', 'deleteditems', 'outbox'). Leave blank to search across all folders.",
      type: "combobox",
      optionsSource: "microsoft-outlook:folders",
      allowManualEntry: true,
      required: false,
      placeholder: "Search folders or paste a folder ID",
    },
    {
      name: "query",
      label: "Search query",
      description:
        "Optional search words (e.g. from:alice invoice). When set, date limits are applied after results return.",
      type: "text",
      required: false,
      placeholder: "from:alice subject:invoice",
    },
    {
      name: "startDate",
      label: "Start date (UTC)",
      description:
        "Optional. Only emails received at or after this time (UTC).",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-01-01T00:00:00Z",
    },
    {
      name: "endDate",
      label: "End date (UTC)",
      description:
        "Optional. Only emails received at or before this time (UTC).",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-12-31T23:59:59Z",
    },
    {
      name: "maxResults",
      label: "Max results",
      description:
        "Cap on results returned by this call (1..50). Defaults to 10. Pagination is not auto-followed — compose multiple calls for larger result sets.",
      type: "number",
      required: false,
      defaultValue: 10,
      numeric: { min: 1, max: 50, integer: true, step: 1 },
    },
  ],
  outputs: [
    {
      name: "messages",
      type: "array",
      description:
        "Array of per-message projections — each carries { id, subject, from, to, cc, receivedDateTime, hasAttachments, importance, bodyPreview, webLink }. Marked sensitive — per-row recipient addresses + body previews redact from the run-detail API and the variable picker preview (token wiring still works).",
      sensitive: true,
    },
    { name: "count", type: "number", description: "messages.length convenience." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
