/**
 * Certification seed — gmail.
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

export const GMAIL_CERTIFICATIONS: readonly CertificationRecord[] = [
  ...records("LIVE_PASS", "live read verified", "2026-06-20", [
    ["gmail", "list_labels"],
    ["gmail", "get_profile"],
    ["gmail", "search_emails"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live draft/label modify + independent message_labels read-back, draft trashed (no email sent)", "2026-07-04", [
    ["gmail", "create_draft"],
    ["gmail", "add_label"],
    ["gmail", "remove_label"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live create label + independent list_labels read-back (label artifact; no registered Gmail delete-label action)", "2026-07-04", [
    ["gmail", "create_label"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live message state toggle + independent message_labels read-back, draft trashed (no email sent)", "2026-07-04", [
    ["gmail", "mark_as_unread"],
    ["gmail", "mark_as_read"],
    ["gmail", "archive_email"],
    ["gmail", "delete_email"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live self-send + independent message_labels read-back (SENT + subject marker), single message trashed", "2026-07-04", [
    ["gmail", "send_email"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live threaded reply/draft-reply + independent message_labels read-back (SENT/DRAFT + threadId==seed + Re: marker), seed + reply trashed", "2026-07-04", [
    ["gmail", "reply_to_email"],
    ["gmail", "create_draft_reply"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live attachment fetch + FileRef(v2_storage) staging + staged-object read-back (no bytes in output); fixed unstable-attachment-id bug", "2026-07-04", [
    ["gmail", "get_attachment"],
  ]),
];
