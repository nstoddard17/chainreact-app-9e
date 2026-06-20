import type { ConnectedAppSourceUi } from "./connectedAppSources";

/**
 * Microsoft Excel connected-app analytics UI descriptor — Slice ANALYTICS-SOURCES-EXCEL-1.
 * Split out of connectedAppSources.ts to keep that module under its line cap. Pure data
 * — type-only import, no runtime cycle.
 *
 * Personal connection (each viewer sees data from THEIR OWN Excel connection). Aggregate/
 * count-only metrics: workbook count + created/modified over time (account-wide, no
 * picker), and worksheet/table counts (require a workbook picker via the
 * microsoft-excel:workbooks resolver). Workbook file names are never emitted as chart
 * data — only counts + date buckets.
 */
export const MICROSOFT_EXCEL: ConnectedAppSourceUi = {
  provider: "microsoft-excel",
  displayName: "Microsoft Excel",
  exposed: true,
  icon: "Database",
  connectHref: "/apps",
  connectTitle: "Connect your Microsoft Excel",
  connectHelp: "This widget uses your own Microsoft Excel connection. Connect it to see your data.",
  connectCtaLabel: "Connect Microsoft Excel",
  visibility: "personal",
  attributionPrefix: "Your Microsoft Excel",
  metricsByType: {
    stat: [
      { id: "workbooks_count", label: "Workbooks", filters: [] },
      { id: "worksheets_count", label: "Worksheets", filters: ["excel_workbook"] },
      { id: "tables_count", label: "Tables", filters: ["excel_workbook"] },
    ],
    line: [
      { id: "workbooks_modified_over_time", label: "Workbooks modified over time", filters: [] },
      { id: "workbooks_created_over_time", label: "Workbooks created over time", filters: [] },
    ],
    bar: [
      { id: "workbooks_modified_over_time", label: "Workbooks modified over time", filters: [] },
      { id: "workbooks_created_over_time", label: "Workbooks created over time", filters: [] },
    ],
  },
};
