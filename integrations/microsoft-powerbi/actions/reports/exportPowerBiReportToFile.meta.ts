import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:export_power_bi_report_to_file`. Mirrors
 * `exportPowerBiReportToFile.schema.ts` 1:1 (camelCase field names).
 *
 * FileRef-producing action (category "files", producesFileRef: true) —
 * the handler stages the exported bytes to V2 storage and returns a
 * `FileRef(kind=v2_storage, provider="microsoft-powerbi")`.
 */
export const microsoftPowerBiExportPowerBiReportToFileMeta: ActionMeta = {
  key: "microsoft-powerbi:export_power_bi_report_to_file",
  provider: "microsoft-powerbi",
  type: "export_power_bi_report_to_file",
  displayName: "Export Power BI Report to File",
  description:
    "Export a Power BI report to PDF, PPTX, or PNG and return the file as a FileRef for downstream actions (email attachment, upload, webhook). Requires the workspace to be on Premium, Embedded, or Fabric capacity — Power BI's ExportTo API is not supported on PPU or shared capacity. Large exports that take longer than ~40 seconds fail with a hint to export fewer pages or a smaller report and retry.",
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
      description: "The Power BI report to export.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:reports",
      dependsOn: "workspaceId",
      placeholder: "Search reports…",
    },
    {
      name: "format",
      label: "Format",
      description:
        "Output file format. Required — it switches the produced artifact type.",
      type: "select",
      required: true,
      options: [
        { value: "PDF", label: "PDF" },
        { value: "PPTX", label: "PowerPoint (PPTX)" },
        { value: "PNG", label: "Image (PNG)" },
      ],
    },
    {
      name: "pageName",
      label: "Page",
      description:
        "Optional — export just this page. Leave empty to export the whole report.",
      type: "combobox",
      required: false,
      optionsSource: "microsoft-powerbi:report_pages",
      dependsOn: ["workspaceId", "reportId"],
      placeholder: "Search pages…",
    },
  ],
  outputs: [
    {
      name: "file",
      type: "fileRef",
      description:
        "Staged FileRef (kind: v2_storage, provider: 'microsoft-powerbi'). Pass to downstream actions that accept file inputs.",
    },
    {
      name: "fileName",
      type: "string",
      description:
        "Final file name including extension (report name when Power BI returns it, else report-<id>).",
      sensitive: true,
    },
    {
      name: "format",
      type: "string",
      description: "Echoed export format (== input.format).",
    },
    {
      name: "exportId",
      type: "string",
      description:
        "Power BI export job id. Null if the provider omitted it.",
      nullable: true,
    },
  ],
  producesFileRef: true,
  consumesFileRef: false,
  displayOrder: 200,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Runs a capacity-consuming export job and stages the exported report content into workflow storage.",
};
