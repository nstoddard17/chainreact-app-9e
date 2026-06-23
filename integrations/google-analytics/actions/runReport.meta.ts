import type { ActionMeta } from "@/contracts/actionMeta";
import {
  DATE_RANGE_OPTIONS,
  REPORT_METRIC_OPTIONS,
  REPORT_DIMENSION_OPTIONS,
} from "./_metaOptions";

/**
 * Google Analytics `run_report` ActionMeta — Slice 3.GOOGLE-ANALYTICS-4.
 *
 * Read. `accountId` is a UI-scope picker (scopes the property cascade — not
 * sent to the Data API); `propertyId` (dependsOn accountId) is the
 * runtime-required identifier. Curated static metric/dimension lists (D-GA4).
 * Field names mirror the GA-2 runtime schema. Report rows are sensitive.
 */
export const googleAnalyticsRunReportMeta: ActionMeta = {
  key: "google-analytics:run_report",
  provider: "google-analytics",
  type: "run_report",
  displayName: "Run Report",
  description:
    "Run a Google Analytics 4 report for a property — pick metrics, dimensions, and a date range.",
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
      description: "Only for a Custom range.",
      type: "date",
      required: false,
    },
    {
      name: "endDate",
      label: "End date",
      description: "Only for a Custom range.",
      type: "date",
      required: false,
    },
    {
      name: "metrics",
      label: "Metrics",
      description: "One or more GA4 metrics to report.",
      type: "select",
      multiple: true,
      required: true,
      options: [...REPORT_METRIC_OPTIONS],
    },
    {
      name: "dimensions",
      label: "Dimensions",
      description: "Optional dimensions to break the metrics down by.",
      type: "select",
      multiple: true,
      required: false,
      options: [...REPORT_DIMENSION_OPTIONS],
    },
    {
      name: "limit",
      label: "Row limit",
      description: "Maximum rows to return.",
      type: "number",
      required: false,
      numeric: { min: 1, integer: true },
    },
  ],
  outputs: [
    { name: "rows", type: "array", description: "Report rows (one record per row).", sensitive: true },
    { name: "rowCount", type: "number", description: "Number of rows returned." },
    { name: "dimensionHeaders", type: "array", description: "Dimension names, in order." },
    { name: "metricHeaders", type: "array", description: "Metric names, in order." },
    { name: "totals", type: "array", description: "Total rows when GA returns them.", sensitive: true },
    { name: "dateRange", type: "object", description: "Resolved {startDate, endDate}." },
    { name: "metrics", type: "array", description: "The metric names requested." },
    { name: "dimensions", type: "array", description: "The dimension names requested." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  riskDescription: "Read-only analytics of your own GA4 property.",
};
