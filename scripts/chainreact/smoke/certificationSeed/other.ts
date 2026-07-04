/**
 * Certification seed — airtable / dropbox / trello / native / asana / facebook / stripe / discord.
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

export const OTHER_CERTIFICATIONS: readonly CertificationRecord[] = [
  ...records("LIVE_PASS", "live read verified", "2026-06-20", [
    ["airtable", "get_base_schema"],
    ["airtable", "get_table_schema"],
    ["airtable", "list_records"],
    ["airtable", "find_record"],
    ["airtable", "get_record"],
  ]),
  ...records("LIVE_PASS", "live read verified (auto-discovered selectors)", "2026-06-21", [
    ["dropbox", "list_folder"],
    ["dropbox", "get_file_metadata"],
    ["facebook", "get_page_insights"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live write+verify, object deleted", "2026-06-22", [
    ["airtable", "create_record"],
    ["airtable", "update_record"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live write + marker verify, object archived", "2026-06-22", [
    ["trello", "create_card"],
    ["trello", "update_card"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live write + independent comment read-back, archived", "2026-06-22", [
    ["trello", "add_comment"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live write+verify, deleted to Dropbox trash (recoverable ~30d)", "2026-06-23", [
    ["dropbox", "create_folder"],
    ["dropbox", "delete_file"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live upload+verify, deleted to Dropbox trash (recoverable ~30d)", "2026-06-23", [
    ["dropbox", "upload_file"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live re-verified in cert checkpoint, object deleted", "2026-06-23", [
    ["airtable", "delete_record"],
    ["airtable", "create_multiple_records"],
    ["airtable", "update_multiple_records"],
    ["airtable", "add_attachment"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live re-verified in cert checkpoint, archived/left (reversible)", "2026-06-23", [
    ["trello", "add_label_to_card"],
    ["trello", "move_card"],
    ["trello", "archive_card"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live setup+copy/move+verify, files deleted to Dropbox trash (recoverable ~30d)", "2026-06-23", [
    ["dropbox", "copy_file"],
    ["dropbox", "move_file"],
  ]),
  ...records("LIVE_PASS", "live verified via workflow-live sweep (native action, no provider credential)", "2026-06-26", [
    ["native", "delay"],
    ["native", "if_then_condition"],
    ["native", "router"],
    ["native", "http_request"],
  ]),
  ...records("LIVE_PASS", "live read verified (search via SMOKE_DROPBOX_QUERY)", "2026-06-26", [
    ["dropbox", "search_files"],
  ]),
  ...records("LIVE_PASS", "live read verified (also the write fixtures' independent read-back seam)", "2026-07-04", [
    ["asana", "get_task"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live write + independent get_task read-back (marker on taskName); no delete-task action, so the completed crsmoke task / comment stays in the smoke project", "2026-07-04", [
    ["asana", "create_task"],
    ["asana", "update_task"],
    ["asana", "complete_task"],
    ["asana", "add_comment_to_task"],
  ]),
  ...records("BLOCKED_ENV", "provider not connected on the smoke account; connect a Stripe TEST-MODE account, then re-run", "2026-07-04", [
    ["stripe", "find_customer"],
    ["stripe", "find_payment_intent"],
    ["stripe", "find_subscription"],
    ["stripe", "get_payments"],
  ]),
  ...records("BLOCKED_ENV", "provider not connected on the smoke account; connect the smoke Discord server, then re-run", "2026-07-04", [
    ["discord", "fetch_messages"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live create (explicit private visibility) + member_boards read-back proves the marker; marked private board stays (no registered delete)", "2026-07-04", [
    ["trello", "create_board"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live list on a smoke private board + board_lists read-back proves the marker; board + list stay (no registered delete)", "2026-07-04", [
    ["trello", "create_list"],
  ]),
];
