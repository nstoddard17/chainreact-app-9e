import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:rebind_report`.
 * Mirrors `rebindReport.schema.ts` 1:1.
 */
export const microsoftPowerBiRebindReportMeta: ActionMeta = {
  key: "microsoft-powerbi:rebind_report",
  provider: "microsoft-powerbi",
  type: "rebind_report",
  displayName: "Rebind Report",
  description:
    "Rebind a Power BI report to a different semantic model (dataset). Power BI reports only — paginated (RDL) reports are not supported by this API (use Update Paginated Report Data Sources instead). Requires Write on the report and Build on the target model; a live-connection report becomes direct-bound after the rebind.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace that contains the report.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "reportId",
      label: "Report",
      description: "The Power BI report to rebind.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:reports",
      dependsOn: "workspaceId",
      placeholder: "Search reports…",
    },
    {
      name: "semanticModelId",
      label: "Semantic model",
      description:
        "The semantic model (dataset) to bind the report to. Required — rebinding changes what every consumer of the report sees.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:semantic_models",
      dependsOn: "workspaceId",
      placeholder: "Search semantic models…",
    },
  ],
  outputs: [
    {
      name: "rebound",
      type: "boolean",
      description: "True when the rebind succeeded.",
    },
    {
      name: "reportId",
      type: "string",
      description: "Report id echoed for chaining.",
    },
    {
      name: "semanticModelId",
      type: "string",
      description: "Target semantic model id echoed for chaining.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 240,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Changes the semantic model behind a shared report — every viewer sees data from the new model immediately.",
};
