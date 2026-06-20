import { createWorkspaceFilesAnalyticsSource } from "../_shared/googleWorkspaceAdapter";

/**
 * Google Sheets connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-GWORKSPACE-1).
 *
 * Thin wrapper over the shared Google Workspace file adapter, pinned to the Google
 * Sheets MIME type. READ-ONLY + METADATA-ONLY + COUNT-ONLY: a flat Drive `files.list`
 * scan filtered to `application/vnd.google-apps.spreadsheet`, reduced to a spreadsheet
 * count + spreadsheets created/modified over time. Never reads a spreadsheet's cell
 * values, sheet/tab names, content, owner, or permissions. Personal + refreshable
 * credential; uses the already-granted `drive.metadata.readonly` scope (which cannot
 * read content). See ../_shared/googleWorkspaceAdapter.ts.
 */
export const googleSheetsAnalyticsSource = createWorkspaceFilesAnalyticsSource({
  providerKey: "google-sheets",
  displayName: "Google Sheets",
  mimeType: "application/vnd.google-apps.spreadsheet",
  countMetric: "spreadsheets_count",
  modifiedMetric: "spreadsheets_modified_over_time",
  createdMetric: "spreadsheets_created_over_time",
  countLabel: "Spreadsheets",
  modifiedLabel: "Spreadsheets modified over time",
  createdLabel: "Spreadsheets created over time",
  noun: "spreadsheet",
  connectNoun: "Google Sheets",
});
