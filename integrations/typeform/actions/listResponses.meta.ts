import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Typeform `list_responses` ActionMeta — TYPEFORM-2.
 *
 * Read-only, one bounded page per run with a response-token cursor — the
 * backfill / digest companion for the webhook trigger. Completed
 * responses only (partials are plan-gated and out of scope).
 *
 * `answers` / `hidden` outputs are respondent content → sensitive
 * (same posture as the trigger's payloadShape). The admin `response_url`
 * and respondent `metadata` (user agent / referer / network id) are
 * never exposed.
 */
export const typeformListResponsesMeta: ActionMeta = {
  key: "typeform:list_responses",
  provider: "typeform",
  type: "list_responses",
  displayName: "List Responses",
  description:
    "List completed responses for a Typeform form, newest first (one page per run, up to 100). Returns a cursor for the next page — useful for digests and backfills.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "formId",
      label: "Form",
      type: "combobox",
      optionsSource: "typeform:forms",
      required: true,
      placeholder: "Search forms…",
      description:
        "Form whose responses are listed. Draft or unpublished forms may appear here but will not receive responses until published in Typeform.",
    },
    {
      name: "pageSize",
      label: "Page size",
      type: "number",
      required: false,
      advanced: true,
      placeholder: "25",
      numeric: { min: 1, max: 100, integer: true },
      description: "Responses per page, 1–100. Defaults to 25.",
    },
    {
      name: "since",
      label: "Submitted after",
      type: "datetime-utc",
      required: false,
      description: "Only responses submitted at or after this time (UTC).",
    },
    {
      name: "until",
      label: "Submitted before",
      type: "datetime-utc",
      required: false,
      description: "Only responses submitted at or before this time (UTC).",
    },
    {
      name: "query",
      label: "Search",
      type: "text",
      required: false,
      placeholder: "Leave empty to list all responses",
      description: "Only responses whose answers or hidden fields match this text.",
    },
    {
      name: "before",
      label: "Page cursor",
      type: "text",
      required: false,
      advanced: true,
      placeholder: "Leave empty for the first (newest) page",
      description:
        "Pagination cursor from a previous run's `nextBefore` output.",
    },
  ],
  outputs: [
    {
      name: "responses",
      type: "array",
      description:
        "Responses on this page, newest first (bounded fields per response).",
      fields: [
        {
          name: "responseToken",
          type: "string",
          description: "Typeform's unique id for this response.",
          nullable: true,
        },
        {
          name: "submittedAt",
          type: "string",
          description: "When the respondent submitted (ISO 8601).",
          nullable: true,
        },
        {
          name: "landedAt",
          type: "string",
          description: "When the respondent opened the form (ISO 8601).",
          nullable: true,
        },
        {
          name: "answers",
          type: "array",
          description:
            "Answered questions: fieldId, fieldRef, fieldType, answerType, value. Skipped questions are absent. Sensitive — respondent content.",
          sensitive: true,
        },
        {
          name: "hidden",
          type: "object",
          description:
            "Hidden-field values passed into the form, when used. Sensitive — respondent content.",
          nullable: true,
          sensitive: true,
        },
        {
          name: "score",
          type: "number",
          description: "Calculated quiz score, when the form scores responses.",
          nullable: true,
        },
      ],
    },
    {
      name: "count",
      type: "number",
      description: "Number of responses returned on this page.",
    },
    {
      name: "totalItems",
      type: "number",
      description:
        "Total responses matching the filters, when Typeform reports it.",
      nullable: true,
    },
    {
      name: "hasMore",
      type: "boolean",
      description: "True when more (older) pages likely exist.",
    },
    {
      name: "nextBefore",
      type: "string",
      description:
        "Cursor for the next (older) page — feed into the Page cursor field. Null on the last page.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
