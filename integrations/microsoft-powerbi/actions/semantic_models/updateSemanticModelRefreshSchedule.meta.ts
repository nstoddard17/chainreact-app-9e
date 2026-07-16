import type { ActionMeta } from "@/contracts/actionMeta";
import { POWERBI_WINDOWS_TIME_ZONE_OPTIONS } from "../_shared/windowsTimeZones";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:update_semantic_model_refresh_schedule`.
 * Mirrors `updateSemanticModelRefreshSchedule.schema.ts` 1:1.
 *
 * `notifyOption` deliberately offers only MailOnFailure / NoNotification —
 * Power BI's ScheduleNotifyOption has no MailOnCompletion (unlike the
 * on-demand refresh action).
 */
export const microsoftPowerBiUpdateSemanticModelRefreshScheduleMeta: ActionMeta =
  {
    key: "microsoft-powerbi:update_semantic_model_refresh_schedule",
    provider: "microsoft-powerbi",
    type: "update_semantic_model_refresh_schedule",
    displayName: "Update Semantic Model Refresh Schedule",
    description:
      "Update a semantic model's scheduled-refresh settings (enable/disable, days, times, time zone, failure notification). Only provided fields are changed. The connected user must own the model (pair with Take Over Semantic Model).",
    category: "data",
    requiresIntegration: true,
    fields: [
      {
        name: "workspaceId",
        label: "Workspace",
        description: "The Power BI workspace that contains the semantic model.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:workspaces",
        placeholder: "Search workspaces…",
      },
      {
        name: "semanticModelId",
        label: "Semantic model",
        description: "The semantic model (dataset) whose schedule to update.",
        type: "combobox",
        required: true,
        optionsSource: "microsoft-powerbi:semantic_models",
        dependsOn: "workspaceId",
        placeholder: "Search semantic models…",
      },
      {
        name: "enabled",
        label: "Schedule enabled",
        description:
          "Whether scheduled refresh is on. Required — pick explicitly. To disable, Power BI expects no other schedule changes in the same request.",
        type: "boolean",
        required: true,
      },
      {
        name: "days",
        label: "Days",
        description: "Days of the week the schedule refreshes on.",
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
        label: "Times",
        description:
          "Local times of day as HH:MM (24-hour), e.g. 07:00. Slot-count limits depend on the workspace's capacity tier.",
        type: "string-array",
        required: false,
        stringArrayMaxItems: 48,
        placeholder: "07:00",
      },
      {
        name: "localTimeZoneId",
        label: "Time zone",
        description:
          "The time zone the refresh times are in. Power BI expects a WINDOWS time-zone id (e.g. \"Pacific Standard Time\") — NOT an IANA name like America/Los_Angeles. This list is a curated subset of the common Windows zones.",
        type: "select",
        required: false,
        // Spread: the shared list stays readonly; ActionMeta wants a mutable array.
        options: [...POWERBI_WINDOWS_TIME_ZONE_OPTIONS],
        placeholder: "UTC",
      },
      {
        name: "notifyOption",
        label: "Failure notification",
        description:
          "Whether Power BI emails the model owner when a scheduled refresh fails. Required — pick explicitly.",
        type: "select",
        required: true,
        options: [
          { value: "MailOnFailure", label: "Email on failure" },
          { value: "NoNotification", label: "No email" },
        ],
      },
    ],
    outputs: [
      {
        name: "updated",
        type: "boolean",
        description: "True when Power BI accepted the schedule update.",
      },
      {
        name: "semanticModelId",
        type: "string",
        description: "Semantic model id echoed for chaining.",
      },
    ],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: 70,
    isDestructive: false,
    requiresConfirmation: false,
    riskLevel: "medium",
    riskDescription:
      "Changes when (and whether) the model refreshes automatically; can change owner failure emails.",
  };
