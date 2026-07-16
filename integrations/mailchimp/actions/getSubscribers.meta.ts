import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:get_subscribers`.
 *
 * Mirrors `getSubscribers.schema.ts`. Read-only paginated list of
 * audience members.
 *
 * **Field-name variance preserved.** This action (and
 * `unsubscribe_subscriber`) uses `listId` instead of `audience_id`,
 * inherited from V1. The `mailchimp:audiences` resolver has no
 * `requiredDeps` so it backs either field name — the picker still
 * works without a sibling resolver.
 *
 * Pagination is offset-based (Mailchimp standard). `count` clamps at
 * 100 per page (1–100 inclusive integer). The handler returns a
 * `nextOffset` hint — `null` when there's no more to read.
 *
 * Optional filters: `status` (subscribed / unsubscribed / etc.),
 * `sinceLastChanged` / `beforeLastChanged` (ISO-8601 timestamps),
 * `sortField` (timestamp_opt | timestamp_signup | last_changed) +
 * `sortDir` (ASC | DESC).
 *
 * Sensitive outputs: `subscribers` (bulk PII collection — every element
 * carries `emailAddress`, `mergeFields`, `tags`). The structural
 * sensitive-name guard doesn't catch `subscribers` (not in the
 * suspicious set), but the plan explicitly classifies it as sensitive.
 */
export const mailchimpGetSubscribersMeta: ActionMeta = {
  key: "mailchimp:get_subscribers",
  provider: "mailchimp",
  type: "get_subscribers",
  displayName: "Get Subscribers",
  description:
    "List subscribers in a Mailchimp audience via `GET /lists/{id}/members`. Paginated (offset-based, count capped at 100). Optional filters: status, since/before last-changed, sort field + direction. Returns a `nextOffset` hint — `null` signals end-of-list.",
  category: "marketing",
  requiresIntegration: true,
  fields: [
    {
      name: "listId",
      label: "Audience",
      description:
        "Mailchimp audience (list) to read. Required. Field name is `listId` (camelCase) — preserved verbatim from the action schema; the `mailchimp:audiences` resolver carries no `requiredDeps` so it works with either field name.",
      type: "combobox",
      optionsSource: "mailchimp:audiences",
      required: true,
      placeholder: "Search audiences…",
    },
    {
      name: "status",
      label: "Status filter",
      description:
        "Optional. Restrict results to a single member status. Leave empty to include all statuses.",
      type: "select",
      required: false,
      options: [
        { value: "subscribed", label: "Subscribed" },
        { value: "unsubscribed", label: "Unsubscribed" },
        { value: "cleaned", label: "Cleaned" },
        { value: "pending", label: "Pending" },
        { value: "transactional", label: "Transactional" },
        { value: "archived", label: "Archived" },
      ],
    },
    {
      name: "count",
      label: "Page size",
      description:
        "Number of subscribers per page (1–100). 50 matches Mailchimp's server default.",
      type: "number",
      required: false,
      defaultValue: 50,
      numeric: { min: 1, max: 100, integer: true },
    },
    {
      name: "offset",
      label: "Offset",
      description: "Pagination offset. Wire from a previous run's `nextOffset` output to walk the audience.",
      type: "number",
      required: false,
      advanced: true,
      numeric: { min: 0, integer: true },
    },
    {
      name: "sinceLastChanged",
      label: "Since last changed",
      description: "Optional. Return only subscribers updated on/after this time (UTC).",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-01-01T00:00:00Z",
    },
    {
      name: "beforeLastChanged",
      label: "Before last changed",
      description: "Optional. Return only subscribers updated before this time (UTC).",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-12-31T23:59:59Z",
    },
    {
      name: "sortField",
      label: "Sort field",
      description: "Optional. Sort by Mailchimp's documented timestamp surfaces.",
      type: "select",
      required: false,
      options: [
        { value: "timestamp_opt", label: "Opt-in time" },
        { value: "timestamp_signup", label: "Signup time" },
        { value: "last_changed", label: "Last changed" },
      ],
    },
    {
      name: "sortDir",
      label: "Sort direction",
      description: "Optional. Applies to the chosen Sort field.",
      type: "select",
      required: false,
      visibleWhen: {
        field: "sortField",
        valueIn: ["timestamp_opt", "timestamp_signup", "last_changed"],
      },
      options: [
        { value: "ASC", label: "Ascending" },
        { value: "DESC", label: "Descending" },
      ],
    },
  ],
  outputs: [
    {
      name: "listId",
      type: "string",
      description: "Mailchimp audience id (echoed).",
    },
    {
      name: "subscribers",
      type: "array",
      description:
        "Subscriber projections: `{ id, emailAddress, uniqueEmailId, contactId, status, mergeFields, tags, timestampSignup, lastChanged, vip, emailType }`. Marked sensitive — bulk PII collection.",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "Number of subscribers returned on this page.",
    },
    {
      name: "totalItems",
      type: "number",
      description: "Total subscriber count for the audience (across all pages).",
    },
    {
      name: "nextOffset",
      type: "number",
      description: "Offset to use for the next page, or `null` when end-of-list is reached.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription:
    "Reads a page of Mailchimp subscribers. Output carries bulk PII — surface through the workflow carefully.",
};
