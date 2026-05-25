import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:create_meeting`.
 *
 * Mirrors `createMeeting.schema.ts` (11 fields). Required:
 * `hs_meeting_title`. Schema defaults `hs_meeting_outcome` to
 * `SCHEDULED` via Zod; meta mirrors that defaultValue.
 *
 * `hs_meeting_start_time` / `hs_meeting_end_time` / `hs_timestamp`
 * all accept ISO 8601 OR millisecond-epoch strings — the handler's
 * `resolveTimestampMs` helper normalizes to epoch-ms-string before
 * sending to HubSpot.
 *
 * Output mirrors `createMeeting.ts:return`. `title` + `location` are
 * sensitive (engagement detail + physical/virtual location can carry
 * customer-identifying context).
 */
export const hubspotCreateMeetingMeta: ActionMeta = {
  key: "hubspot:create_meeting",
  provider: "hubspot",
  type: "create_meeting",
  displayName: "Create Meeting",
  description:
    "Create a HubSpot CRM engagement meeting via `/crm/v3/objects/meetings`. Requires `hs_meeting_title`. `hs_meeting_outcome` defaults to `SCHEDULED` (matches V1). Start / end times accept ISO 8601 OR millisecond-epoch string; the handler normalizes to epoch-ms before sending. Optional associations to contact / company / deal / ticket.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "hs_meeting_title",
      label: "Title",
      description: "Required. The meeting title — free-form text.",
      type: "text",
      required: true,
      placeholder: "Quarterly business review with Acme",
    },
    {
      name: "hs_meeting_body",
      label: "Body",
      description: "Optional meeting description / agenda — free-form text.",
      type: "textarea",
      required: false,
    },
    {
      name: "hs_meeting_start_time",
      label: "Start time",
      description:
        "ISO 8601 datetime (`2026-12-31T10:00:00Z`) OR a millisecond-epoch string. Handler normalizes to epoch-ms before sending to HubSpot.",
      type: "text",
      required: false,
      placeholder: "2026-12-31T10:00:00Z",
    },
    {
      name: "hs_meeting_end_time",
      label: "End time",
      description:
        "ISO 8601 datetime OR millisecond-epoch string. Pair with `Start time` to bracket the meeting on HubSpot's calendar.",
      type: "text",
      required: false,
      placeholder: "2026-12-31T11:00:00Z",
    },
    {
      name: "hs_meeting_location",
      label: "Location",
      description:
        "Free-form meeting location — physical address, room name, or video-conference URL.",
      type: "text",
      required: false,
    },
    {
      name: "hs_meeting_outcome",
      label: "Outcome",
      description:
        "Meeting outcome. Defaults to `SCHEDULED` if omitted (matches V1 + the schema's Zod default).",
      type: "select",
      required: false,
      defaultValue: "SCHEDULED",
      options: [
        { value: "SCHEDULED", label: "SCHEDULED" },
        { value: "COMPLETED", label: "COMPLETED" },
        { value: "RESCHEDULED", label: "RESCHEDULED" },
        { value: "NO_SHOW", label: "NO_SHOW" },
        { value: "CANCELED", label: "CANCELED" },
      ],
    },
    {
      name: "hs_timestamp",
      label: "Timestamp",
      description:
        "When the meeting was logged. ISO 8601 datetime OR millisecond-epoch string. Defaults to `Date.now()` if omitted.",
      type: "text",
      required: false,
    },
    {
      name: "hubspot_owner_id",
      label: "Owner",
      description:
        "HubSpot user account that owns this meeting. The picker returns the owner `id` (NOT the `userId`).",
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
      name: "meetingId",
      type: "string",
      description: "HubSpot meeting id.",
    },
    {
      name: "title",
      type: "string",
      description: "Echoed `hs_meeting_title` property. Marked sensitive — meeting titles carry customer-identifying engagement detail.",
      sensitive: true,
    },
    {
      name: "outcome",
      type: "string",
      description: "Echoed `hs_meeting_outcome` property after the create.",
    },
    {
      name: "startTime",
      type: "string",
      description: "Echoed `hs_meeting_start_time` (epoch-ms string, null when omitted).",
    },
    {
      name: "endTime",
      type: "string",
      description: "Echoed `hs_meeting_end_time` (epoch-ms string, null when omitted).",
    },
    {
      name: "location",
      type: "string",
      description: "Echoed `hs_meeting_location` (null when omitted). Marked sensitive — physical addresses + video-conf URLs can carry access-bearing context.",
      sensitive: true,
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
        "Full HubSpot meeting properties map. Variable-shape. Marked sensitive — carries the meeting body / location / agenda + custom properties.",
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
  displayOrder: 170,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a HubSpot CRM engagement meeting visible to all portal users. May trigger calendar-sync notifications if HubSpot's calendar integrations are enabled.",
};
