import type { ActionMeta } from "@/contracts/actionMeta";
import { POWERBI_WINDOWS_TIME_ZONE_OPTIONS } from "../_shared/windowsTimeZones";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:update_dataflow_refresh_schedule`.
 * Mirrors `updateDataflowRefreshSchedule.schema.ts` 1:1. PATCH
 * semantics — only provided fields are sent; days/times/timezone left
 * blank keep their current provider-side values.
 */
export const microsoftPowerBiUpdateDataflowRefreshScheduleMeta: ActionMeta = {
  key: "microsoft-powerbi:update_dataflow_refresh_schedule",
  provider: "microsoft-powerbi",
  type: "update_dataflow_refresh_schedule",
  displayName: "Update Dataflow Refresh Schedule",
  description:
    "Create or update a dataflow's scheduled-refresh settings: enable/disable, refresh days and times, time zone, and failure notification. Only the fields you set are changed.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace that contains the dataflow.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "dataflowId",
      label: "Dataflow",
      description: "The dataflow whose refresh schedule to update.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:dataflows",
      dependsOn: "workspaceId",
      placeholder: "Search dataflows…",
    },
    {
      name: "enabled",
      label: "Schedule enabled",
      description:
        "Whether scheduled refresh is on for this dataflow. Required — pick explicitly.",
      type: "boolean",
      required: true,
    },
    {
      name: "notifyOption",
      label: "Email notification",
      description:
        "Whether Power BI emails the dataflow owner when a scheduled refresh fails. Required — pick explicitly. Email-on-completion is not supported for dataflows.",
      type: "select",
      required: true,
      options: [
        { value: "MailOnFailure", label: "Email on failure" },
        { value: "NoNotification", label: "No email" },
      ],
    },
    {
      name: "days",
      label: "Refresh days",
      description:
        "Days of the week to refresh. Leave blank to keep the current days.",
      type: "select",
      required: false,
      multiple: true,
      options: [
        { value: "Sunday", label: "Sunday" },
        { value: "Monday", label: "Monday" },
        { value: "Tuesday", label: "Tuesday" },
        { value: "Wednesday", label: "Wednesday" },
        { value: "Thursday", label: "Thursday" },
        { value: "Friday", label: "Friday" },
        { value: "Saturday", label: "Saturday" },
      ],
    },
    {
      name: "times",
      label: "Refresh times",
      description:
        'Local times of day to refresh, as "HH:MM" 24-hour values (e.g. 03:00, 14:30). Leave blank to keep the current times.',
      type: "string-array",
      required: false,
      stringArrayMaxItems: 48,
      placeholder: "03:00",
    },
    {
      name: "localTimeZoneId",
      label: "Time zone",
      description:
        'The time zone the schedule times are in. Power BI expects a WINDOWS time-zone id (e.g. "Pacific Standard Time") — NOT an IANA name like America/Los_Angeles. This list is a curated subset of the common Windows zones. Leave blank to keep the current time zone.',
      type: "select",
      required: false,
      // Spread: the shared list stays readonly; ActionMeta wants a mutable array.
      options: [...POWERBI_WINDOWS_TIME_ZONE_OPTIONS],
      placeholder: "UTC",
    },
  ],
  outputs: [
    {
      name: "updated",
      type: "boolean",
      description: "True when the schedule update was accepted.",
    },
    {
      name: "dataflowId",
      type: "string",
      description: "Dataflow id echoed for chaining.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 430,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Changes when (and whether) the dataflow refreshes on a schedule; affects downstream dataset freshness.",
};
