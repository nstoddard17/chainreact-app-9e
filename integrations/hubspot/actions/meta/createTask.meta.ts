import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:create_task`.
 *
 * Mirrors `createTask.schema.ts` (12 fields). Required:
 * `hs_task_subject`. Schema declares Zod `.default()` on status /
 * priority / type — meta mirrors those defaults as `defaultValue`
 * for the renderer. (These are internal task-metadata enums, NOT
 * customer-facing high-risk choices — Q11's no-hidden-defaults rule
 * doesn't apply.)
 *
 * Associations same shape as `create_note` — best-effort via the v4
 * default-typed associations API.
 *
 * Output mirrors `createTask.ts:return`. `subject` is marked sensitive
 * even though it's not in SUSPICIOUS_NAMES — task subjects often
 * carry customer-identifying engagement detail (matches HUBSPOT-4
 * ticket `subject` precedent).
 */
export const hubspotCreateTaskMeta: ActionMeta = {
  key: "hubspot:create_task",
  provider: "hubspot",
  type: "create_task",
  displayName: "Create Task",
  description:
    "Create a HubSpot CRM engagement task via `/crm/v3/objects/tasks`. Requires `hs_task_subject`. Status / priority / type default to `NOT_STARTED` / `MEDIUM` / `TODO` (matching V1). Optional associations to contact / company / deal / ticket — failures surface as `associationWarnings` rather than rolling back the task.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "hs_task_subject",
      label: "Subject",
      description: "Required. The task title — free-form text.",
      type: "text",
      required: true,
      placeholder: "Follow up with Acme on contract",
    },
    {
      name: "hs_task_body",
      label: "Body",
      description: "Optional task body / notes — free-form text.",
      type: "textarea",
      required: false,
    },
    {
      name: "hs_task_status",
      label: "Status",
      description:
        "Task status. Defaults to `NOT_STARTED` if omitted (matches V1 + the schema's Zod default).",
      type: "select",
      required: false,
      defaultValue: "NOT_STARTED",
      options: [
        { value: "NOT_STARTED", label: "NOT_STARTED" },
        { value: "IN_PROGRESS", label: "IN_PROGRESS" },
        { value: "COMPLETED", label: "COMPLETED" },
        { value: "WAITING", label: "WAITING" },
        { value: "DEFERRED", label: "DEFERRED" },
      ],
    },
    {
      name: "hs_task_priority",
      label: "Priority",
      description:
        "Task priority. Defaults to `MEDIUM` if omitted (matches V1 + the schema's Zod default).",
      type: "select",
      required: false,
      defaultValue: "MEDIUM",
      options: [
        { value: "LOW", label: "LOW" },
        { value: "MEDIUM", label: "MEDIUM" },
        { value: "HIGH", label: "HIGH" },
      ],
    },
    {
      name: "hs_task_type",
      label: "Type",
      description:
        "Task type. Defaults to `TODO` if omitted (matches V1 + the schema's Zod default).",
      type: "select",
      required: false,
      defaultValue: "TODO",
      options: [
        { value: "TODO", label: "TODO" },
        { value: "CALL", label: "CALL" },
        { value: "EMAIL", label: "EMAIL" },
      ],
    },
    {
      name: "hs_timestamp",
      label: "Due timestamp",
      description:
        "When the task is due. ISO 8601 datetime OR a millisecond-epoch string. Omit to leave HubSpot's task without a due date.",
      type: "text",
      required: false,
      placeholder: "2026-12-31T17:00:00Z",
    },
    {
      name: "hs_task_reminders",
      label: "Reminders",
      description:
        "Comma-separated millisecond-epoch timestamps for HubSpot reminder pings. Free-form string — HubSpot validates server-side.",
      type: "text",
      required: false,
    },
    {
      name: "hubspot_owner_id",
      label: "Owner",
      description:
        "HubSpot user account assigned to this task. The picker returns the owner `id` (NOT the `userId`).",
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
      name: "taskId",
      type: "string",
      description: "HubSpot task id. Wire downstream into association actions.",
    },
    {
      name: "subject",
      type: "string",
      description: "Echoed `hs_task_subject` property. Marked sensitive — task subjects carry customer-identifying engagement detail.",
      sensitive: true,
    },
    {
      name: "status",
      type: "string",
      description: "Echoed `hs_task_status` property after the create.",
    },
    {
      name: "priority",
      type: "string",
      description: "Echoed `hs_task_priority` property after the create.",
    },
    {
      name: "type",
      type: "string",
      description: "Echoed `hs_task_type` property after the create.",
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
        "Full HubSpot task properties map. Variable-shape. Marked sensitive — carries the task body + due date + owner + custom properties.",
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
  displayOrder: 150,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a HubSpot CRM task visible to all portal users and to the assigned owner. May trigger HubSpot task-reminder notifications.",
};
