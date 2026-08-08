import { createWorkspaceFilesAnalyticsSource } from "../_shared/googleWorkspaceAdapter";

/**
 * Google Sheets connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-GWORKSPACE-1).
 *
 * Thin wrapper over the shared Google Workspace file adapter, pinned to the Google
 * Sheets MIME type. READ-ONLY + METADATA-ONLY + COUNT-ONLY: a flat Drive `files.list`
 * scan filtered to `application/vnd.google-apps.spreadsheet`, reduced to a spreadsheet
 * count + spreadsheets created/modified over time. Never reads a spreadsheet's cell
 * values, sheet/tab names, content, owner, or permissions. Personal + refreshable
 * credential. See ../_shared/googleWorkspaceAdapter.ts.
 *
 * SCOPE-AWARE AVAILABILITY (GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2): this dataset
 * needs whole-Drive spreadsheet metadata visibility to answer "how many spreadsheets
 * do you have". The Sheets provider no longer REQUESTS such a scope — new connections
 * get per-file `drive.file` — so the dataset is available only to connections that
 * still hold a historical broad grant, and reports SCOPE_UNAVAILABLE otherwise. A
 * `drive.file` scan would return just the files picked for workflows, and presenting
 * that as the user's spreadsheet total would be a fabricated number. Deliberate
 * least-privilege trade-off: workflows are entirely unaffected.
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
  // Historical broad grants only. `drive.file` is deliberately absent: it
  // cannot see the corpus, so it must not silently produce a partial total.
  scanScopes: [
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive",
  ],
});
