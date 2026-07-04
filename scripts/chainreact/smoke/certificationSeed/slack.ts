/**
 * Certification seed — slack.
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

export const SLACK_CERTIFICATIONS: readonly CertificationRecord[] = [
  ...records("LIVE_PASS", "live read verified", "2026-06-20", [
    ["slack", "list_channels"],
    ["slack", "list_users"],
    ["slack", "list_scheduled_messages"],
    ["slack", "get_messages"],
    ["slack", "get_thread_messages"],
  ]),
  ...records("LIVE_PASS", "live write verified (dedicated smoke channel)", "2026-06-20", [
    ["slack", "send_channel_message"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live post smoke message + delete it + independent get_messages marker-absent read-back", "2026-07-03", [
    ["slack", "delete_message"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live smoke message + update/reaction + per-message message_state read-back + delete cleanup", "2026-07-03", [
    ["slack", "update_message"],
    ["slack", "add_reaction"],
    ["slack", "remove_reaction"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live create smoke channel + rename/topic/purpose/archive + channel_state read-back (archived-channel artifact; no hard delete)", "2026-07-03", [
    ["slack", "create_channel"],
    ["slack", "rename_channel"],
    ["slack", "set_channel_topic"],
    ["slack", "set_channel_purpose"],
    ["slack", "archive_channel"],
  ]),
  ...records("LIVE_PASS", "live read re-verified after JSON->form transport fix (conversations.info / users.info)", "2026-07-03", [
    ["slack", "get_channel_info"],
    ["slack", "get_user_info"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live membership write + independent read-back on a smoke channel, archived (no hard delete)", "2026-07-03", [
    ["slack", "join_channel"],
    ["slack", "leave_channel"],
    ["slack", "invite_users_to_channel"],
    ["slack", "remove_user_from_channel"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live schedule/cancel + independent scheduledMessages.list read-back (scheduled message cancelled, none left to deliver)", "2026-07-03", [
    ["slack", "schedule_message"],
    ["slack", "cancel_scheduled_message"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live DM send + independent get_messages read-back of the opened DM (delivered-DM artifact; sendSafe, no cleanup)", "2026-07-03", [
    ["slack", "send_direct_message"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live Block Kit post + independent get_messages read-back of the block marker, message deleted", "2026-07-03", [
    ["slack", "post_interactive_blocks"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live upload + independent files.info read-back (uploaded-file artifact; no registered Slack delete)", "2026-07-03", [
    ["slack", "upload_file"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live download + FileRef(v2_storage) staging + independent staged-object read-back (no bytes in output)", "2026-07-03", [
    ["slack", "download_file"],
  ]),
  ...records("LIVE_PASS", "live read re-verified after files.info JSON->form transport fix (2026-06-20 pass was stale)", "2026-07-03", [
    ["slack", "get_file_info"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live pin/unpin + independent conversations.history pinned_to read-back (no pins:read needed), message deleted", "2026-07-03", [
    ["slack", "pin_message"],
    ["slack", "unpin_message"],
  ]),
  ...records("BLOCKED_ENV", "slack token expired (rotation enabled on the app; V2 slack oauth stores no refresh token by design); reconnect slack or ship rotation support", "2026-07-04", [
    ["slack", "unarchive_channel"],
  ]),
];
