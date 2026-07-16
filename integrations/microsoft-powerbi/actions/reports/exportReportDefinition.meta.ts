import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:export_report_definition`. Mirrors
 * `exportReportDefinition.schema.ts` 1:1.
 */
export const microsoftPowerBiExportReportDefinitionMeta: ActionMeta = {
  key: "microsoft-powerbi:export_report_definition",
  provider: "microsoft-powerbi",
  type: "export_report_definition",
  displayName: "Export Report Definition (.pbix)",
  description:
    "Download a report's .pbix definition file and return it as a FileRef for downstream actions (backup to cloud storage, attach to email). Fails for reports whose model uses incremental refresh and for very large models — the documented .pbix download limitations apply. Exporting a report with a Power BI service live connection after a rebind is not supported.",
  category: "files",
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
      description: "The report whose .pbix definition to download.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:reports",
      dependsOn: "workspaceId",
      placeholder: "Search reports…",
    },
  ],
  outputs: [
    {
      name: "file",
      type: "fileRef",
      description:
        "Staged FileRef (kind: v2_storage, provider: 'microsoft-powerbi') containing the .pbix bytes.",
    },
    {
      name: "fileName",
      type: "string",
      description: "File name (report-<id>.pbix).",
      sensitive: true,
    },
  ],
  producesFileRef: true,
  consumesFileRef: false,
  displayOrder: 220,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Stages the full report definition — including its data model — into workflow storage.",
};
