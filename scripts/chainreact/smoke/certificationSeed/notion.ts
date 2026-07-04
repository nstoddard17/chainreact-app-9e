/**
 * Certification seed — notion.
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

export const NOTION_CERTIFICATIONS: readonly CertificationRecord[] = [
  ...records("LIVE_PASS", "live read verified", "2026-06-20", [
    ["notion", "search"],
    ["notion", "list_users"],
    ["notion", "query_database"],
    ["notion", "get_page"],
  ]),
  ...records("LIVE_PASS", "live read verified (page id as block id)", "2026-07-01", [
    ["notion", "get_block"],
    ["notion", "get_block_children"],
  ]),
  ...records("LIVE_PASS", "live read verified (auto-discovered selectors)", "2026-06-21", [
    ["notion", "get_user"],
    ["notion", "list_comments"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live write + marker verify, object archived", "2026-06-22", [
    ["notion", "create_page"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live write + read-back marker verify, archived", "2026-06-22", [
    ["notion", "update_page"],
    ["notion", "append_block_children"],
    ["notion", "create_comment"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live re-verified in cert checkpoint, archived/left (reversible)", "2026-06-23", [
    ["notion", "create_database_entry"],
    ["notion", "archive_page"],
    ["notion", "restore_page"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live create under the discovered smoke parent + query_database read-back proves existence (results present-and-empty); empty marked database stays", "2026-07-04", [
    ["notion", "create_database"],
  ]),
];
