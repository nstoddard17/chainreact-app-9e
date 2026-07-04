/**
 * Certification seed — monday.
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

export const MONDAY_CERTIFICATIONS: readonly CertificationRecord[] = [
  ...records("LIVE_PASS", "live read verified", "2026-06-30", [
    ["monday", "list_boards"],
    ["monday", "list_users"],
    ["monday", "get_board"],
    ["monday", "get_item"],
    ["monday", "get_user"],
    ["monday", "list_groups"],
    ["monday", "list_items"],
    ["monday", "list_subitems"],
    ["monday", "list_updates"],
    ["monday", "search_items"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live write+verify, item deleted (soft delete, recycle-bin recoverable)", "2026-06-30", [
    ["monday", "create_item"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live write+verify, item renamed then deleted (soft delete)", "2026-06-30", [
    ["monday", "update_item"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live write+verify, child removed via parent-item delete (soft delete)", "2026-06-30", [
    ["monday", "create_update"],
    ["monday", "create_subitem"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live delete+verify, item removed and absent from list (soft delete)", "2026-06-30", [
    ["monday", "delete_item"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live move+verify (groupId==target), item deleted (soft delete)", "2026-06-30", [
    ["monday", "move_item"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live archive+verify (state==archived), then deleted (soft delete)", "2026-06-30", [
    ["monday", "archive_item"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live duplicate+verify, original and clone both deleted (soft delete)", "2026-06-30", [
    ["monday", "duplicate_item"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live create (explicit public boardKind) + independent get_board read-back; marked board stays (no registered board delete)", "2026-07-04", [
    ["monday", "create_board"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live structure-only clone of a smoke-created source + get_board read-back on the NEW board; both marked boards stay (no board delete)", "2026-07-04", [
    ["monday", "duplicate_board"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live group on a smoke-created board + independent list_groups read-back; marked board stays (no group/board delete)", "2026-07-04", [
    ["monday", "create_group"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live text column on a smoke-created board + independent get_board columns read-back; marked board stays (no column/board delete)", "2026-07-04", [
    ["monday", "add_column"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live multipart upload into a file column on a fully smoke-owned board/item + get_item column-value read-back (marker filename); marked board stays", "2026-07-04", [
    ["monday", "add_file"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live download of a smoke-uploaded asset staged to a v2_storage FileRef (no bytes) + staged_file read-back; marked board + staged object stay", "2026-07-04", [
    ["monday", "download_file"],
  ]),
];
