import type { ActionMeta } from "@/contracts/actionMeta";
import {
  DATE_RANGE_OPTIONS,
  REPORT_METRIC_OPTIONS,
  REPORT_DIMENSION_OPTIONS,
} from "./_metaOptions";

/**
 * Google Analytics `run_pivot_report` ActionMeta — Slice
 * 3.GOOGLE-ANALYTICS-4.
 *
 * Read. Like run_report plus `pivotDimensions` (the column dimensions).
 * `accountId` UI-scope → `propertyId` (dependsOn accountId, required). Report
 * rows + pivot column headers are sensitive.
 */
export const googleAnalyticsRunPivotReportMeta: ActionMeta = {
  key: "google-analytics:run_pivot_report",
  provider: "google-analytics",
  type: "run_pivot_report",
  displayName: "Run Pivot Report",
  description:
    "Run a Google Analytics 4 pivot report — break metrics down by row dimensions and pivot other dimensions into columns.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "accountId",
      sensitivity: "connection",
      label: "Account",
      description: "Pick an account to choose its property below.",
      type: "combobox",
      optionsSource: "google-analytics:accounts",
      required: false,
      placeholder: "Select an account",
    },
    {
      name: "propertyId",
      label: "Property",
      description: "The GA4 property to report on.",
      type: "combobox",
      optionsSource: "google-analytics:properties",
      dependsOn: "accountId",
      required: true,
      placeholder: "Select a property",
    },
    {
      name: "dateRange",
      label: "Date range",
      type: "select",
      required: true,
      options: [...DATE_RANGE_OPTIONS],
    },
    {
      name: "startDate",
      label: "Start date",
      description: "Only for a Custom range. ISO date, e.g. 2026-01-01.",
      type: "text",
      required: false,
      placeholder: "2026-01-01",
    },
    {
      name: "endDate",
      label: "End date",
      description: "Only for a Custom range. ISO date, e.g. 2026-01-31.",
      type: "text",
      required: false,
      placeholder: "2026-01-31",
    },
    {
      name: "metrics",
      label: "Metrics",
      type: "select",
      multiple: true,
      required: true,
      options: [...REPORT_METRIC_OPTIONS],
    },
    {
      name: "dimensions",
      label: "Row dimensions",
      description: "Dimensions for the pivot table rows.",
      type: "select",
      multiple: true,
      required: false,
      options: [...REPORT_DIMENSION_OPTIONS],
    },
    {
      name: "pivotDimensions",
      label: "Column dimensions",
      description: "Dimensions to pivot into columns.",
      type: "select",
      multiple: true,
      required: false,
      options: [...REPORT_DIMENSION_OPTIONS],
    },
    {
      name: "limit",
      label: "Row limit",
      type: "number",
      required: false,
      numeric: { min: 1, integer: true },
    },
  ],
  outputs: [
    { name: "rows", type: "array", description: "Pivot report rows.", sensitive: true },
    { name: "rowCount", type: "number", description: "Number of rows returned." },
    { name: "columnHeaders", type: "array", description: "Pivot column header values.", sensitive: true },
    { name: "dateRange", type: "object", description: "Resolved {startDate, endDate}." },
    { name: "metrics", type: "array", description: "The metric names requested." },
    { name: "dimensions", type: "array", description: "The row dimension names requested." },
    { name: "pivotDimensions", type: "array", description: "The column dimension names requested." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Read-only analytics of your own GA4 property.",
};
