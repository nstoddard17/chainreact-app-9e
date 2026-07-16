import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:refresh_dataflow`.
 * Mirrors `refreshDataflow.schema.ts` 1:1.
 */
export const microsoftPowerBiRefreshDataflowMeta: ActionMeta = {
  key: "microsoft-powerbi:refresh_dataflow",
  provider: "microsoft-powerbi",
  type: "refresh_dataflow",
  displayName: "Refresh Dataflow",
  description:
    "Start an on-demand refresh of a dataflow. Power BI returns no refresh id for dataflows — observe completion with Get Dataflow Refresh History (the newest transaction).",
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
      description: "The dataflow to refresh.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:dataflows",
      dependsOn: "workspaceId",
      placeholder: "Search dataflows…",
    },
    {
      name: "notifyOption",
      label: "Email notification",
      description:
        "Whether Power BI emails the dataflow owner on failure. Required — pick explicitly. Email-on-completion is not supported for dataflows.",
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
      name: "started",
      type: "boolean",
      description:
        "True when the refresh was accepted. The API returns no refresh id for dataflows — completion is observed via the refresh-history transactions.",
    },
    {
      name: "dataflowId",
      type: "string",
      description: "Dataflow id echoed for chaining.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 400,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Consumes the dataflow's refresh quota and capacity resources; can email the dataflow owner on failure.",
};
