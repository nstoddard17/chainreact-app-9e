import { createWorkspaceFilesAnalyticsSource } from "../_shared/googleWorkspaceAdapter";

/**
 * Google Docs connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-GWORKSPACE-1).
 *
 * Thin wrapper over the shared Google Workspace file adapter, pinned to the Google Docs
 * MIME type. READ-ONLY + METADATA-ONLY + COUNT-ONLY: a flat Drive `files.list` scan
 * filtered to `application/vnd.google-apps.document`, reduced to a document count +
 * documents created/modified over time. Never reads a document's content, name, owner,
 * permissions, comments, or revisions. Personal + refreshable credential; uses the
 * already-granted `drive` scope. See ../_shared/googleWorkspaceAdapter.ts.
 */
export const googleDocsAnalyticsSource = createWorkspaceFilesAnalyticsSource({
  providerKey: "google-docs",
  displayName: "Google Docs",
  mimeType: "application/vnd.google-apps.document",
  countMetric: "documents_count",
  modifiedMetric: "documents_modified_over_time",
  createdMetric: "documents_created_over_time",
  countLabel: "Documents",
  modifiedLabel: "Documents modified over time",
  createdLabel: "Documents created over time",
  noun: "document",
  connectNoun: "Google Docs",
});
