/**
 * Certification seed — mailchimp.
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

export const MAILCHIMP_CERTIFICATIONS: readonly CertificationRecord[] = [
  ...records("LIVE_PASS", "live read verified (auto-discovered selectors)", "2026-06-21", [
    ["mailchimp", "get_campaign"],
    ["mailchimp", "get_campaign_stats"],
    ["mailchimp", "get_subscribers"],
    ["mailchimp", "get_subscriber"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live subscriber lifecycle (add/update/unsubscribe/tags/delete) via registered get_subscriber read-back; plus-addressed owner mailbox; all members deleted", "2026-07-04", [
    ["mailchimp", "add_subscriber"],
    ["mailchimp", "update_subscriber"],
    ["mailchimp", "unsubscribe_subscriber"],
    ["mailchimp", "add_tag"],
    ["mailchimp", "remove_tag"],
    ["mailchimp", "remove_subscriber"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live note/event on a seeded member + independent notes/contact-events read-back; member permanently deleted (note and event go with it)", "2026-07-04", [
    ["mailchimp", "add_note"],
    ["mailchimp", "create_custom_event"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live empty static segment create + independent segment GET-by-id read-back; no registered delete so the empty crsmoke segment stays", "2026-07-04", [
    ["mailchimp", "create_segment"],
  ]),
  ...records("BLOCKED_ENV", "live create refused by Mailchimp plan entitlement (audience cap on the smoke account); fixture + lists read-back ready, re-run when a slot exists", "2026-07-04", [
    ["mailchimp", "create_audience"],
  ]),
];
