import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:create_call`.
 *
 * Mirrors `createCall.schema.ts` (11 fields). NO required field —
 * HubSpot accepts an empty call as a "logged call" placeholder
 * (V1 parity). Schema defaults `hs_call_status` to `COMPLETED` via
 * Zod; meta mirrors that defaultValue. `hs_call_direction` is an
 * enum (`INBOUND` / `OUTBOUND`) with NO default — surfaced as a
 * select with no `defaultValue` so the renderer leaves the choice
 * to the workflow author.
 *
 * `hs_call_duration` is TEXT (numeric string, HubSpot accepts call
 * length in ms).
 *
 * Output mirrors `createCall.ts:return`. `title` is sensitive even
 * though it's not in SUSPICIOUS_NAMES (matches the create_task
 * `subject` sensitivity precedent — engagement titles carry
 * customer-identifying call context).
 */
export const hubspotCreateCallMeta: ActionMeta = {
  key: "hubspot:create_call",
  provider: "hubspot",
  type: "create_call",
  displayName: "Create Call",
  description:
    "Create a HubSpot CRM engagement call via `/crm/v3/objects/calls`. NO required field — HubSpot accepts an empty call as a logged-call placeholder. `hs_call_status` defaults to `COMPLETED` (matches V1). `hs_timestamp` accepts ISO 8601 OR millisecond-epoch string; defaults to `Date.now()`. Optional associations to contact / company / deal / ticket.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "hs_call_title",
      label: "Title",
      description: "Optional call title — free-form text.",
      type: "text",
      required: false,
      placeholder: "Onboarding call with Acme",
    },
    {
      name: "hs_call_body",
      label: "Body",
      description: "Optional call notes / summary — free-form text.",
      type: "textarea",
      required: false,
    },
    {
      name: "hs_call_duration",
      label: "Duration (ms)",
      description:
        "**Numeric STRING** — call duration in milliseconds. HubSpot expects a stringified number. Wire an upstream number through `{{String(value)}}` if needed.",
      type: "text",
      required: false,
      placeholder: "900000",
    },
    {
      name: "hs_call_direction",
      label: "Direction",
      description:
        "Call direction. NO default — the workflow author picks (HubSpot leaves the field empty on a logged call when omitted).",
      type: "select",
      required: false,
      options: [
        { value: "INBOUND", label: "INBOUND" },
        { value: "OUTBOUND", label: "OUTBOUND" },
      ],
    },
    {
      name: "hs_call_disposition",
      label: "Disposition",
      description:
        "HubSpot `hs_call_disposition` property. Portal-configured GUID (or display string per portal config) — free-form here.",
      type: "text",
      required: false,
    },
    {
      name: "hs_call_status",
      label: "Status",
      description:
        "Call status. Defaults to `COMPLETED` if omitted (matches V1 + the schema's Zod default).",
      type: "select",
      required: false,
      defaultValue: "COMPLETED",
      options: [
        { value: "BUSY", label: "BUSY" },
        { value: "CANCELED", label: "CANCELED" },
        { value: "COMPLETED", label: "COMPLETED" },
        { value: "CONNECTING", label: "CONNECTING" },
        { value: "FAILED", label: "FAILED" },
        { value: "IN_PROGRESS", label: "IN_PROGRESS" },
        { value: "NO_ANSWER", label: "NO_ANSWER" },
        { value: "QUEUED", label: "QUEUED" },
        { value: "RINGING", label: "RINGING" },
      ],
    },
    {
      name: "hs_timestamp",
      label: "Timestamp",
      description:
        "When the call happened. ISO 8601 datetime OR millisecond-epoch string. Defaults to `Date.now()` if omitted.",
      type: "text",
      required: false,
    },
    {
      name: "hubspot_owner_id",
      label: "Owner",
      description:
        "HubSpot user account that owns this call. The picker returns the owner `id` (NOT the `userId`).",
      type: "combobox",
      optionsSource: "hubspot:owners",
      required: false,
      placeholder: "Search owners…",
    },
    {
      name: "associatedContactId",
      label: "Associated contact ID",
      description: "Optional HubSpot contact id to associate. Best-effort.",
      type: "text",
      required: false,
    },
    {
      name: "associatedCompanyId",
      label: "Associated company ID",
      description: "Optional HubSpot company id to associate. Best-effort.",
      type: "text",
      required: false,
    },
    {
      name: "associatedDealId",
      label: "Associated deal ID",
      description: "Optional HubSpot deal id to associate. Best-effort.",
      type: "text",
      required: false,
    },
    {
      name: "associatedTicketId",
      label: "Associated ticket ID",
      description: "Optional HubSpot ticket id to associate. Best-effort.",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    {
      name: "callId",
      type: "string",
      description: "HubSpot call id.",
    },
    {
      name: "title",
      type: "string",
      description: "Echoed `hs_call_title` property (null when omitted). Marked sensitive — call titles carry customer-identifying engagement detail.",
      sensitive: true,
    },
    {
      name: "status",
      type: "string",
      description: "Echoed `hs_call_status` property after the create.",
    },
    {
      name: "duration",
      type: "string",
      description: "Echoed `hs_call_duration` property (null when omitted).",
    },
    {
      name: "direction",
      type: "string",
      description: "Echoed `hs_call_direction` property (null when omitted).",
    },
    {
      name: "createdAt",
      type: "string",
      description: "ISO 8601 timestamp from HubSpot.",
    },
    {
      name: "properties",
      type: "object",
      description:
        "Full HubSpot call properties map. Variable-shape. Marked sensitive — carries the call body (`hs_call_body`) + title + custom properties.",
      sensitive: true,
    },
    {
      name: "associationsAttached",
      type: "array",
      description: "Per-association success report.",
    },
    {
      name: "associationWarnings",
      type: "array",
      description: "Per-association failure report. Empty when all succeeded.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 160,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a HubSpot CRM engagement call visible to all portal users and to associated CRM records.",
};
