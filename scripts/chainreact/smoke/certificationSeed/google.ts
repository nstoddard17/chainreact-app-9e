/**
 * Certification seed — google-sheets / google-drive / google-calendar / google-docs / google-analytics.
 *
 * Split from the monolithic certificationSeed.ts (provider-scoped modules;
 * DATA UNCHANGED — every record's provider/action/status/date/note is
 * byte-identical to the pre-split seed, proven by the seed-split invariance
 * test). Batch-history narrative lives in git and the action-smoke runbook;
 * each record's note remains the durable certification context.
 *
 * SAFETY: safe facts only — no secrets, tokens, selector values, ids,
 * payloads, or PII (guarded by certification.test.ts).
 */
import type { CertificationRecord } from "../certification";
import { records } from "./_shared";

export const GOOGLE_CERTIFICATIONS: readonly CertificationRecord[] = [
  ...records("LIVE_PASS", "live read verified", "2026-06-20", [
    ["google-sheets", "get_sheet_metadata"],
    ["google-sheets", "read_rows"],
    ["google-sheets", "get_cell_value"],
    ["google-sheets", "find_row"],
    ["google-drive", "list_files"],
    ["google-drive", "get_file_metadata"],
    ["google-drive", "search_files"],
  ]),
  ...records("LIVE_PASS", "live read verified (auto-discovered selectors)", "2026-06-21", [
    ["google-calendar", "list_events"],
    ["google-docs", "get_document"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live write+verify, object permanently deleted", "2026-06-23", [
    ["google-drive", "create_folder"],
    ["google-drive", "upload_file"],
    ["google-drive", "delete_file"],
    ["google-drive", "move_file"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live write+verify, event hard-deleted (true erase)", "2026-06-23", [
    ["google-calendar", "create_event"],
    ["google-calendar", "update_event"],
    ["google-calendar", "delete_event"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live write+verify, hard-deleted via cross-provider Drive delete", "2026-06-23", [
    ["google-docs", "create_document"],
    ["google-sheets", "create_spreadsheet"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live create-sheet + mutate + independent read-back, whole spreadsheet hard-deleted via cross-provider Drive delete", "2026-06-24", [
    ["google-sheets", "update_cell"],
    ["google-sheets", "append_row"],
    ["google-sheets", "update_row"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live create-sheet + seed + clear + independent empty read-back, whole spreadsheet hard-deleted via cross-provider Drive delete", "2026-06-24", [
    ["google-sheets", "clear_range"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live create-sheet + seed + format + independent bounded format read-back, whole spreadsheet hard-deleted via cross-provider Drive delete", "2026-06-24", [
    ["google-sheets", "format_range"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live create-sheet + one-cell batch write + independent value read-back, whole spreadsheet hard-deleted via cross-provider Drive delete", "2026-06-24", [
    ["google-sheets", "batch_update"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live create-sheet + seed 3 rows + delete row 2 + 3 independent shift read-backs, whole spreadsheet hard-deleted via cross-provider Drive delete", "2026-06-25", [
    ["google-sheets", "delete_row"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live create doc + append update + independent read-back, whole doc hard-deleted via cross-provider Drive delete", "2026-06-26", [
    ["google-docs", "update_document"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live create event + add reserved-.invalid attendee (no invites) + independent list_events read-back, event hard-deleted (true erase)", "2026-06-29", [
    ["google-calendar", "add_attendees"],
  ]),
  ...records("BLOCKED_ENV", "connected, but the Google login sees zero GA accounts/properties (accountSummaries.list empty, probed live); grant GA4 property access, re-run", "2026-07-04", [
    ["google-analytics", "find_conversion"],
    ["google-analytics", "get_realtime_data"],
    ["google-analytics", "run_pivot_report"],
    ["google-analytics", "run_report"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live export of a smoke doc staged to a v2_storage FileRef (no bytes) + staged_file read-back; marked doc + staged object stay", "2026-07-04", [
    ["google-docs", "export_document"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live anyone-link share on a smoke doc (notify false) + permission-shape read-back proves type anyone; doc hard-deleted (cross-provider drive delete)", "2026-07-04", [
    ["google-docs", "share_document"],
  ]),
];
