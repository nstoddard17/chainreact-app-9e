import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `mailchimp:create_segment`.
 *
 * Mirrors `createSegment.schema.ts` — a Zod discriminated union on
 * `mode` (static | saved). The meta exposes the SUPERSET of fields and
 * scopes each mode-specific field with a top-level `visibleWhen` on
 * `mode` (CONFIG-UX-SETUP-ADVANCED-1), matching the union's arms:
 *
 *   - `audience_id` + `name` + `mode`: always required.
 *   - `static_emails`: visible only when `mode = static` (the saved-
 *     mode `.strict()` arm REJECTS it). Optional — empty static
 *     segments are legal.
 *   - `conditions`: visible only when `mode = saved` and REQUIRED
 *     there (required-when-visible; SavedModeSchema demands min 1 —
 *     the static arm rejects it).
 *   - `match`: visible only when `mode = saved`; optional.
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
        "The email addresses to seed the segment with — one at a time. Leave empty for an empty static segment.",
      type: "string-array",
      required: false,
      visibleWhen: { field: "mode", valueIn: ["static"] },
      placeholder: "member@example.com",
    },
    {
      name: "conditions",
      label: "Conditions",
      description:
        "Add one rule per row — the member field to test (a merge field like `EMAIL`), how to compare it (e.g. `contains`), and the value to match. See Mailchimp's segment-conditions reference for valid field/comparison combinations.",
      type: "object-list",
      required: true,
      visibleWhen: { field: "mode", valueIn: ["saved"] },
      itemFields: [
        {
          name: "field",
          label: "Field",
          description: "Merge field to test — e.g. `EMAIL`, or a custom merge field's tag.",
          type: "text",
          required: true,
          placeholder: "EMAIL",
        },
        {
          name: "op",
          label: "Comparison",
          description:
            "How to compare — e.g. is, not, contains, notcontain, starts, ends, greater, less. Valid comparisons depend on the field.",
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
      label: "Match",
      description:
        "Optional. `any` = OR semantics (member matches if at least one condition is true); `all` = AND semantics. Mailchimp's server default is `any`.",
      type: "select",
      required: false,
      visibleWhen: { field: "mode", valueIn: ["saved"] },
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
