/**
 * Certification seed — hubspot.
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

export const HUBSPOT_CERTIFICATIONS: readonly CertificationRecord[] = [
  ...records("LIVE_PASS", "live read verified (auto-discovered selectors)", "2026-06-21", [
    ["hubspot", "get_companies"],
    ["hubspot", "get_contacts"],
    ["hubspot", "get_deals"],
    ["hubspot", "get_line_items"],
    ["hubspot", "get_owners"],
    ["hubspot", "get_products"],
    ["hubspot", "get_tickets"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live CRM create/update + independent GET-by-id seam read-back; no delete action exists so the marked object stays on the throwaway portal", "2026-07-04", [
    ["hubspot", "create_contact"],
    ["hubspot", "update_contact"],
    ["hubspot", "create_company"],
    ["hubspot", "update_company"],
    ["hubspot", "create_deal"],
    ["hubspot", "update_deal"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live engagement/object create+update + independent GET-by-id seam read-back; create_task hs_timestamp default bug fixed then re-certified; no delete action", "2026-07-04", [
    ["hubspot", "create_note"],
    ["hubspot", "create_task"],
    ["hubspot", "create_ticket"],
    ["hubspot", "update_ticket"],
    ["hubspot", "create_product"],
    ["hubspot", "update_product"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live line-item lifecycle on a staged parent deal; independent GET-by-id read-back, remove proves exists==false via typed 404; staged deal archived", "2026-07-04", [
    ["hubspot", "create_line_item"],
    ["hubspot", "update_line_item"],
    ["hubspot", "remove_line_item"],
  ]),
  ...records("LIVE_PASS_LEFT_ARTIFACT", "live engagement record create + independent GET-by-id seam read-back (marker on title); no telephony/invites; no delete action so the marked record stays", "2026-07-04", [
    ["hubspot", "create_call"],
    ["hubspot", "create_meeting"],
  ]),
  ...records("LIVE_PASS_CLEANED", "live membership add/remove on a staged MANUAL smoke list + independent memberships read-back; fixed v1-body/405 bug (v3 is PUT + record ids)", "2026-07-04", [
    ["hubspot", "add_contact_to_list"],
    ["hubspot", "remove_from_list"],
  ]),
];
