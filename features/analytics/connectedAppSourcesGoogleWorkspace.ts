import type { ConnectedAppSourceUi } from "./connectedAppSources";

/**
 * Google Workspace document-provider descriptors (Google Docs + Google Sheets) for the
 * connected-app analytics UI — Slice ANALYTICS-SOURCES-GWORKSPACE-1. Split out of
 * connectedAppSources.ts to keep that module under its line cap as the provider list
 * grows. Pure data — type-only import, no runtime cycle.
 *
 * Both are personal connections (each viewer sees THEIR OWN file metadata), backed by
 * the shared metadata-only Drive files.list reader. No filters — the metrics report
 * across all accessible Docs/Sheets, so no picker is rendered.
 */

export const GOOGLE_DOCS: ConnectedAppSourceUi = {
  provider: "google-docs",
  displayName: "Google Docs",
  exposed: true,
  icon: "Layers",
  connectHref: "/apps",
  connectTitle: "Connect your Google Docs",
  connectHelp: "This widget uses your own Google Docs connection. Connect it to see your data.",
  connectCtaLabel: "Connect Google Docs",
  visibility: "personal",
  attributionPrefix: "Your Google Docs",
  metricsByType: {
    stat: [{ id: "documents_count", label: "Documents", filters: [] }],
    line: [
      { id: "documents_modified_over_time", label: "Documents modified over time", filters: [] },
      { id: "documents_created_over_time", label: "Documents created over time", filters: [] },
    ],
    bar: [
      { id: "documents_modified_over_time", label: "Documents modified over time", filters: [] },
      { id: "documents_created_over_time", label: "Documents created over time", filters: [] },
    ],
  },
};

export const GOOGLE_SHEETS: ConnectedAppSourceUi = {
  provider: "google-sheets",
  displayName: "Google Sheets",
  exposed: true,
  icon: "Database",
  connectHref: "/apps",
  connectTitle: "Connect your Google Sheets",
  connectHelp: "This widget uses your own Google Sheets connection. Connect it to see your data.",
  connectCtaLabel: "Connect Google Sheets",
  visibility: "personal",
  attributionPrefix: "Your Google Sheets",
  metricsByType: {
    stat: [{ id: "spreadsheets_count", label: "Spreadsheets", filters: [] }],
    line: [
      { id: "spreadsheets_modified_over_time", label: "Spreadsheets modified over time", filters: [] },
      { id: "spreadsheets_created_over_time", label: "Spreadsheets created over time", filters: [] },
    ],
    bar: [
      { id: "spreadsheets_modified_over_time", label: "Spreadsheets modified over time", filters: [] },
      { id: "spreadsheets_created_over_time", label: "Spreadsheets created over time", filters: [] },
    ],
  },
};
