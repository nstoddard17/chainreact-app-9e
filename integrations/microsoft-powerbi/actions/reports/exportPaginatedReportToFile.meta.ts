import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for
 * `microsoft-powerbi:export_paginated_report_to_file`. Mirrors
 * `exportPaginatedReportToFile.schema.ts` 1:1.
 *
 * Format enum = the documented paginated-report set (research.md §2.2);
 * PNG is Power BI-reports-only and IMAGE needs device-info settings, so
 * neither appears here.
 */
export const microsoftPowerBiExportPaginatedReportToFileMeta: ActionMeta = {
  key: "microsoft-powerbi:export_paginated_report_to_file",
  provider: "microsoft-powerbi",
  type: "export_paginated_report_to_file",
  displayName: "Export Paginated Report to File",
  description:
    "Export a paginated (RDL) report to PDF, PPTX, XLSX, DOCX, CSV, XML, MHTML, or accessible PDF and return the file as a FileRef for downstream actions. Optional report parameters fill RDL parameters at render time. Requires the workspace to be on Premium, Embedded, or Fabric capacity — the ExportTo API is not supported on PPU or shared capacity. Large exports that take longer than ~40 seconds fail with a hint to export a smaller report and retry.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "workspaceId",
      label: "Workspace",
      description: "The Power BI workspace that contains the paginated report.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:workspaces",
      placeholder: "Search workspaces…",
    },
    {
      name: "paginatedReportId",
      label: "Paginated report",
      description: "The paginated (RDL) report to export.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-powerbi:paginated_reports",
      dependsOn: "workspaceId",
      placeholder: "Search paginated reports…",
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
        { value: "XLSX", label: "Excel (XLSX)" },
        { value: "DOCX", label: "Word (DOCX)" },
        { value: "CSV", label: "CSV" },
        { value: "XML", label: "XML" },
        { value: "MHTML", label: "Web archive (MHTML)" },
        { value: "ACCESSIBLEPDF", label: "Accessible PDF" },
      ],
    },
    {
      name: "parameterValues",
      label: "Report parameters",
      description:
        "Optional RDL report parameter values applied at render time (max 50).",
      type: "object-list",
      required: false,
      listMaxItems: 50,
      itemFields: [
        {
          name: "name",
          label: "Parameter name",
          type: "text",
          required: true,
        },
        {
          name: "value",
          label: "Value",
          type: "text",
          required: true,
        },
      ],
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
      description: "Power BI export job id. Null if the provider omitted it.",
      nullable: true,
    },
  ],
  producesFileRef: true,
  consumesFileRef: false,
  displayOrder: 210,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Runs a capacity-consuming export job and stages the exported report content into workflow storage.",
};
