import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-powerbi:clone_report`.
 * Mirrors `cloneReport.schema.ts` 1:1.
 */
export const microsoftPowerBiCloneReportMeta: ActionMeta = {
  key: "microsoft-powerbi:clone_report",
  provider: "microsoft-powerbi",
  type: "clone_report",
  displayName: "Clone Report",
  description:
    "Create a copy of a Power BI report — in the same workspace by default, or in another workspace, optionally rebound to a different semantic model. Requires the Content.Create permission. A live-connection report loses the live connection on clone and gets a direct binding.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace that contains the source report.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "reportId",
      label: "Report",
      description: "The report to clone.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:reports",
      dependsOn: "workspaceId",
      placeholder: "Search reports…",
    },
    {
      name: "newReportName",
      label: "New report name",
      description: "Name for the cloned report.",
      type: "text",
      required: true,
      placeholder: "Q4 Sales (copy)",
    },
    {
      name: "targetWorkspaceId",
      label: "Target workspace",
      description:
        "Optional — workspace to clone into. Defaults to the same workspace.",
      type: "combobox",
      required: false,
      advanced: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "targetSemanticModelId",
      label: "Target semantic model",
      description:
        "Optional — rebind the clone to this semantic model (dataset). Defaults to the source report's model. Pick a target workspace first; the models listed are the ones in it.",
      type: "combobox",
      required: false,
      advanced: true,
      optionsSource: "microsoft-powerbi:target_semantic_models",
      dependsOn: "targetWorkspaceId",
      placeholder: "Search semantic models…",
    },
  ],
  outputs: [
    {
      name: "reportId",
      type: "string",
      description: "Id of the newly created report.",
    },
    {
      name: "name",
      type: "string",
      description: "Name of the newly created report.",
      sensitive: true,
    },
    {
      name: "workspaceId",
      type: "string",
      description:
        "Target workspace id of the clone. Null when the provider omits it from the response.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 230,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a new report in the connected tenant (needs the Content.Create permission).",
};
