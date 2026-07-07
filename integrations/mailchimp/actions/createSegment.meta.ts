import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:create_segment`.
 *
 * Mirrors `createSegment.schema.ts` — a Zod discriminated union on
 * `mode` (static | saved). The contract layer can't represent the
 * union directly via individual `FieldMeta` entries, so the meta
 * exposes the SUPERSET of fields with their cross-mode requirements
 * documented in the descriptions:
 *
 *   - `audience_id` + `name` + `mode`: always required.
 *   - `static_emails`: required when `mode = static`.
 *   - `conditions`: required when `mode = saved` (object-list rows).
 *   - `match`: optional, only meaningful when `mode = saved`.
 *
 * `mode` carries NO defaultValue (Q11 — workflow authors must pick
 * static vs saved deliberately because the semantics differ). The
 * runtime schema enforces the cross-field requirements; the builder UI
 * surfaces them up front via the descriptions.
 *
 * `conditions` is an `object-list` of `{ field, op, value }` rule rows
 * per Mailchimp's segment DSL, and `static_emails` is a `string-array`
 * chip list (CONFIG-UX-AUDIT-1 — both previously paste-JSON textareas
 * whose literal strings the runtime schema rejected). Field/op stay
 * free-text because Mailchimp's valid field/op combinations vary per
 * audience (merge fields); the runtime schema + Mailchimp's API stay
 * authoritative.
 *
 * Audience picker uses the MAILCHIMP-2 `mailchimp:audiences` resolver.
 *
 * `name` is sensitive (segment names may carry customer-identifying
 * business data). `segmentId`, `audienceId`, `mode`, `memberCount`,
 * `createdAt` are structural.
 *
 * Risk: medium — creates a new segment (additive). Mailchimp segments
 * are not customer-facing; they're internal targeting cohorts.
 */
export const mailchimpCreateSegmentMeta: ActionMeta = {
  key: "mailchimp:create_segment",
  provider: "mailchimp",
  type: "create_segment",
  displayName: "Create Segment",
  description:
    "Create a Mailchimp segment inside an audience via `POST /lists/{id}/segments`. **`mode` determines required fields** — `static` segments need `static_emails`; `saved` segments need `conditions` (Mailchimp's rule DSL). Mailchimp also supports `fuzzy` segments, not exposed in V2 Batch 1.",
  category: "marketing",
  requiresIntegration: true,
  fields: [
    {
      name: "audience_id",
      label: "Audience",
      description: "Mailchimp audience (list) to add the segment to. Required.",
      type: "combobox",
      optionsSource: "mailchimp:audiences",
      required: true,
      placeholder: "Search audiences…",
    },
    {
      name: "name",
      label: "Segment name",
      description: "Display name for the new segment. Required.",
      type: "text",
      required: true,
      placeholder: "VIPs",
    },
    {
      name: "mode",
      label: "Mode",
      description:
        "**Required — no default.** `static` = manually-curated list of emails (provide `Static segment emails`). `saved` = rule-based, auto-refreshing (provide `Conditions`).",
      type: "select",
      required: true,
      options: [
        { value: "static", label: "Static (manually-curated emails)" },
        { value: "saved", label: "Saved (rule-based, auto-refreshing)" },
      ],
    },
    {
      name: "static_emails",
      label: "Static segment emails",
      description:
        "Used when Mode is `static`. Add the email addresses to seed the segment with — one at a time. Leave empty for an empty static segment.",
      type: "string-array",
      required: false,
      placeholder: "member@example.com",
    },
    {
      name: "conditions",
      label: "Conditions (saved segments only)",
      description:
        "Used when Mode is `saved`. Add one rule per row — the member field to test (e.g. `EMAIL`), how to compare it (e.g. `contains`), and the value to match. See Mailchimp's segment-conditions reference for valid field/comparison combinations.",
      type: "object-list",
      required: false,
      itemFields: [
        {
          name: "field",
          label: "Field",
          type: "text",
          required: true,
          placeholder: "EMAIL",
        },
        {
          name: "op",
          label: "Comparison",
          type: "text",
          required: true,
          placeholder: "contains",
        },
        {
          name: "value",
          label: "Value",
          type: "text",
          required: true,
          placeholder: "@acme.com",
        },
      ],
    },
    {
      name: "match",
      label: "Match (saved segments only)",
      description:
        "Optional. Only meaningful when `Mode = saved`. `any` = OR semantics (member matches if at least one condition is true); `all` = AND semantics. Mailchimp's server default is `any`.",
      type: "select",
      required: false,
      options: [
        { value: "any", label: "Any (OR — match if at least one condition is true)" },
        { value: "all", label: "All (AND — match only when every condition is true)" },
      ],
    },
  ],
  outputs: [
    {
      name: "segmentId",
      type: "string",
      description: "Mailchimp segment id (stringified — Mailchimp's wire form is numeric).",
    },
    {
      name: "name",
      type: "string",
      description: "Echoed segment name. Marked sensitive — may carry customer-identifying business data.",
      sensitive: true,
    },
    {
      name: "audienceId",
      type: "string",
      description: "Mailchimp audience id the segment was created in (echoed).",
    },
    {
      name: "mode",
      type: "string",
      description: "Echoed segment mode (`static` or `saved`).",
    },
    {
      name: "memberCount",
      type: "number",
      description: "Current member count of the new segment (Mailchimp populates this immediately for static, asynchronously for saved).",
    },
    {
      name: "createdAt",
      type: "string",
      description: "Segment creation timestamp (ISO-8601).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a new Mailchimp segment. Segments are internal targeting cohorts — not customer-visible until a campaign uses them.",
};
