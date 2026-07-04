/**
 * Certification seed — microsoft-outlook / microsoft-outlook-calendar / microsoft-teams / microsoft-excel / microsoft-onedrive / microsoft-onenote.
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

export const MICROSOFT_CERTIFICATIONS: readonly CertificationRecord[] = [
  ...records("LIVE_PASS", "live read verified", "2026-06-20", [
    ["microsoft-outlook", "list_folders"],
    ["microsoft-outlook", "get_profile"],
    ["microsoft-outlook", "fetch_emails"],
    ["microsoft-teams", "get_channel_details"],
    ["microsoft-teams", "get_team_members"],
    ["microsoft-teams", "list_teams"],
    ["microsoft-teams", "list_channels"],
    ["microsoft-teams", "list_channel_messages"],
    ["microsoft-excel", "get_workbooks"],
    ["microsoft-excel", "get_worksheets"],
    ["microsoft-excel", "read_range"],
    ["microsoft-excel", "read_table_rows"],
    ["microsoft-excel", "find_row"],
  ]),
  ...records("LIVE_PASS", "live read verified (auto-discovered selectors)", "2026-06-21", [
    ["microsoft-onedrive", "list_items"],
    ["microsoft-onenote", "list_notebooks"],
    ["microsoft-onenote", "list_sections"],
    ["microsoft-onenote", "list_pages"],
    ["microsoft-onenote", "get_notebook_details"],
    ["microsoft-onenote", "get_section_details"],
    ["microsoft-onenote", "get_page_content"],
    ["microsoft-outlook-calendar", "list_events"],
    ["microsoft-onedrive", "get_file"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live write+verify, deleted to OneDrive recycle bin (recoverable)", "2026-06-23", [
    ["microsoft-onedrive", "create_folder"],
    ["microsoft-onedrive", "delete_item"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live upload+verify, deleted to OneDrive recycle bin (recoverable)", "2026-06-23", [
    ["microsoft-onedrive", "upload_file"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live write+verify, event hard-deleted (true erase)", "2026-06-23", [
    ["microsoft-outlook-calendar", "create_event"],
    ["microsoft-outlook-calendar", "update_event"],
    ["microsoft-outlook-calendar", "delete_event"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live setup+move/rename+verify, items deleted to OneDrive recycle bin (recoverable)", "2026-06-23", [
    ["microsoft-onedrive", "move_item"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live setup+copy+monitor-poll+verify, all three deleted to OneDrive recycle bin (recoverable)", "2026-06-25", [
    ["microsoft-onedrive", "copy_item"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live create page in a smoke-named section + independent read-back + hard delete", "2026-06-25", [
    ["microsoft-onenote", "create_page"],
    ["microsoft-onenote", "update_page"],
    ["microsoft-onenote", "delete_page"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live copy in a smoke-named section, durable-copy discovery + independent read-back + hard delete of source and copy", "2026-07-03", [
    ["microsoft-onenote", "copy_page"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live upload smoke workbook + add worksheet + independent get_worksheets read-back, whole workbook deleted to OneDrive recycle bin (recoverable)", "2026-06-26", [
    ["microsoft-excel", "create_worksheet"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live upload smoke workbook + rename worksheet + independent get_worksheets read-back, whole workbook deleted to OneDrive recycle bin (recoverable)", "2026-06-26", [
    ["microsoft-excel", "rename_worksheet"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live upload smoke workbook + worksheet/table-row mutation + independent read-back, whole workbook deleted to OneDrive recycle bin (recoverable)", "2026-06-29", [
    ["microsoft-excel", "delete_worksheet"],
    ["microsoft-excel", "add_table_row"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live create event + add reserved-.invalid attendee (no invites) + independent list_events read-back, event hard-deleted (true erase)", "2026-06-29", [
    ["microsoft-outlook-calendar", "add_attendees"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live create Drafts-folder draft (never sent, .invalid recipient) + independent fetch_emails read-back, draft permanently deleted", "2026-06-29", [
    ["microsoft-outlook", "create_draft_email"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live upload smoke workbook + row add/update/delete + independent read_range read-back, whole workbook deleted to OneDrive recycle bin (recoverable)", "2026-06-29", [
    ["microsoft-excel", "add_row"],
    ["microsoft-excel", "update_row"],
    ["microsoft-excel", "delete_row"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live self-send + find_messages marker poll proves inbox+sentitems copies; both hard-deleted", "2026-07-04", [
    ["microsoft-outlook", "send_email"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live reply to a staged self-sent seed; RE-prefixed marker copies proven in inbox+sentitems, both hard-deleted; seed removed by dev test", "2026-07-04", [
    ["microsoft-outlook", "reply_to_email"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live forward of a staged seed to self; FW-prefixed marker copies proven, both hard-deleted; seed removed by dev test", "2026-07-04", [
    ["microsoft-outlook", "forward_email"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live categories PATCH on a smoke draft + message_state read-back proves the marker category; draft hard-deleted", "2026-07-04", [
    ["microsoft-outlook", "add_categories"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live move of a smoke draft to archive (Graph re-keys; newId tracked) + folder read-back proves placement; hard-deleted", "2026-07-04", [
    ["microsoft-outlook", "move_email"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live trash of a smoke draft + deleteditems read-back proves placement (recoverable); permanent mode exercised as the other outlook cleanups", "2026-07-04", [
    ["microsoft-outlook", "delete_email"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live fetch of a seed attachment staged to a v2_storage FileRef (no bytes) + staged_file read-back; tiny staged object stays; seed removed by dev test", "2026-07-04", [
    ["microsoft-outlook", "get_attachment"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live text send to the pinned smoke channel + per-message body read-back proves the marker; marked message stays (no registered delete)", "2026-07-04", [
    ["microsoft-teams", "send_channel_message"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live reply under a smoke parent; reply read via the parent /replies subpath proves marker body AND replyToId==parent; both messages stay", "2026-07-04", [
    ["microsoft-teams", "reply_to_channel_message"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live text send to a discovered existing chat + per-message body read-back proves the marker; marked chat message stays (no registered delete)", "2026-07-04", [
    ["microsoft-teams", "send_chat_message"],
  ]),
  ...records("LIVE_PASS", "live read verified (used-range parse of the standing smoke worksheet; no file output)", "2026-07-04", [
    ["microsoft-excel", "export_sheet"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live create + list_notebooks read-back proves the marker; notebook stays (Graph exposes no notebook delete)", "2026-07-04", [
    ["microsoft-onenote", "create_notebook"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live section on a smoke notebook + list_sections read-back proves the marker; notebook + section stay (Graph exposes no delete)", "2026-07-04", [
    ["microsoft-onenote", "create_section"],
  ]),
];
