import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:create_note`.
 *
 * Mirrors `createNote.schema.ts` (7 fields). Required: `hs_note_body`.
 * `hs_timestamp` is optional — handler defaults to `Date.now()` and
 * also accepts ISO 8601 → epoch-ms conversion via `_resolveTimestamp`.
 *
 * Associations (`associatedContactId` / `associatedCompanyId` /
 * `associatedDealId` / `associatedTicketId`) are best-effort via the
 * v4 default-typed associations API — failures surface as
 * `associationWarnings` rather than rolling back the note.
 *
 * `hubspot_owner_id` consumes the HUBSPOT-2 `hubspot:owners` resolver.
 *
 * Output mirrors `createNote.ts:return` exactly. `body` is flagged as
 * a SUSPICIOUS_NAMES match in the structural sensitive-output test —
 * MUST be marked sensitive (customer-identifying note content). The
 * `properties` map is also sensitive (carries the full HubSpot
 * property map including hs_note_body).
 */
export const hubspotCreateNoteMeta: ActionMeta = {
  key: "hubspot:create_note",
  provider: "hubspot",
  type: "create_note",
  displayName: "Create Note",
  description:
    "Create a HubSpot CRM engagement note via `/crm/v3/objects/notes`. Requires `hs_note_body` — the note body. Optional associations attach the note to a contact / company / deal / ticket in parallel; failed associations surface as `associationWarnings` rather than rolling back the note. `hs_timestamp` accepts ISO 8601 OR a millisecond-epoch string; defaults to `Date.now()` when omitted.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "hs_note_body",
      label: "Body",
      description:
        "Required. The note body — free-form text. HubSpot stores this as the `hs_note_body` property and renders it in the engagement timeline.",
      type: "textarea",
      required: true,
    },
    {
      name: "hs_timestamp",
      label: "Timestamp",
      description:
        "When the note happened, entered in **UTC** (stored as `2026-12-31T14:30:00Z`). Omit to default to `Date.now()` at execution time. A pasted millisecond-epoch string still hydrates as editable text.",
      type: "datetime-utc",
      required: false,
      placeholder: "2026-12-31T14:30:00Z",
    },
    {
      name: "hubspot_owner_id",
      label: "Owner",
      description: "HubSpot user account that owns this note.",
      type: "combobox",
      optionsSource: "hubspot:owners",
      required: false,
      placeholder: "Search owners…",
    },
    {
      name: "associatedContactId",
      label: "Associated contact",
      description:
        "Link this note to a contact — search contacts by name, paste a contact ID, or insert one from an earlier step. If linking fails the note is still created (see associationWarnings).",
      type: "combobox",
      optionsSource: "hubspot:contacts",
      allowManualEntry: true,
      required: false,
      placeholder: "Search contacts or paste an ID…",
    },
    {
      name: "associatedCompanyId",
      label: "Associated company",
      description:
        "Link this note to a company — search companies by name, paste a company ID, or insert one from an earlier step. If linking fails the note is still created (see associationWarnings).",
      type: "combobox",
      optionsSource: "hubspot:companies",
      allowManualEntry: true,
      required: false,
      placeholder: "Search companies or paste an ID…",
    },
    {
      name: "associatedDealId",
      label: "Associated deal",
      description:
        "Link this note to a deal — search deals by name, paste a deal ID, or insert one from an earlier step. If linking fails the note is still created (see associationWarnings).",
      type: "combobox",
      optionsSource: "hubspot:deals",
      allowManualEntry: true,
      required: false,
      placeholder: "Search deals or paste an ID…",
    },
    {
      name: "associatedTicketId",
      label: "Associated ticket",
      description:
        "Link this note to a ticket — search tickets by subject, paste a ticket ID, or insert one from an earlier step. If linking fails the note is still created (see associationWarnings).",
      type: "combobox",
      optionsSource: "hubspot:tickets",
      allowManualEntry: true,
      required: false,
      placeholder: "Search tickets or paste an ID…",
    },
  ],
  outputs: [
    {
      name: "noteId",
      type: "string",
      description: "HubSpot note id. Wire downstream into association actions.",
    },
    {
      name: "body",
      type: "string",
      description: "Echoed `hs_note_body` property. Marked sensitive — note bodies often carry customer-identifying engagement detail.",
      sensitive: true,
    },
    {
      name: "timestamp",
      type: "string",
      description: "Echoed `hs_timestamp` property — the resolved epoch-ms string HubSpot recorded.",
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
        "Full HubSpot note properties map. Variable-shape. Marked sensitive — carries the note body + owner + custom properties.",
      sensitive: true,
    },
    {
      name: "associationsAttached",
      type: "array",
      description:
        "Per-association success report: `{toType, toId}[]` for every association the helper completed.",
    },
    {
      name: "associationWarnings",
      type: "array",
      description:
        "Per-association failure report: `{toType, toId, message}[]` for every association that FAILED. Empty when all succeeded.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 140,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a HubSpot CRM engagement note visible to all portal users and to associated CRM records (contacts / companies / deals / tickets).",
};
