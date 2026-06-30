/**
 * Trigger-smoke — certification seed (durable, version-controlled).
 *
 * The trigger-side analog of the action certification seed. Records which
 * registered triggers have passed a REAL dispatch-path live smoke. Kept minimal
 * and dependency-free on purpose: a typed record + a small seed array. Later
 * polling / webhook trigger smokes append rows in the SAME shape (so a future
 * trigger-matrix CLI can read this directly), but we do NOT build that CLI yet.
 *
 * SAFETY — committed artifact, SAFE FACTS ONLY: trigger key, activation, a status
 * enum, an optional ISO date, and a SHORT sanitized note. NEVER secrets, ids,
 * payloads, or PII.
 *
 * Status semantics:
 *   - LIVE_PASS        — fired through its REAL dispatch path to a verifiable
 *                        terminal run (the only true certification).
 *   - RUN_NOW_PROVEN   — exercised end-to-end ONLY via the manual run-now path
 *                        (enqueueRun), which bypasses dispatchTriggerEvent. An
 *                        honest, weaker status than LIVE_PASS — NOT a dispatch
 *                        cert. Used for native:manual.run.
 *   - NOT_RUN          — a harness/fixture exists but no real pass recorded yet.
 *   - MISSING_HARNESS  — no trigger-smoke harness for this trigger's lane yet.
 */

export type TriggerActivationMode = "webhook" | "polling" | "manual" | "scheduled";

export type TriggerCertStatus =
  | "LIVE_PASS"
  | "RUN_NOW_PROVEN"
  | "NOT_RUN"
  | "MISSING_HARNESS";

export interface TriggerCertRecord {
  readonly provider: string;
  readonly type: string;
  readonly activation: TriggerActivationMode;
  readonly status: TriggerCertStatus;
  /** ISO date of the recorded pass (LIVE_PASS / RUN_NOW_PROVEN only). */
  readonly date?: string;
  readonly note: string;
}

export const TRIGGER_CERTIFICATIONS: readonly TriggerCertRecord[] = [
  // native:schedule.fired — LIVE-CERTIFIED via the scheduled-trigger smoke harness
  // (tests/trigger-smoke/scheduledSmoke.ts): real activation arms nextFireAt, a
  // tick BEFORE nextFireAt fires nothing (baseline-first), a tick AT nextFireAt
  // fires exactly one run through dispatchTriggerEvent, the durable-queue run
  // reaches terminal 'succeeded', then trigger_resources + workflow are cleaned up.
  // No provider, no external resource, no send. (Flip to LIVE_PASS only after the
  // gated dev integration test reports pass.)
  {
    provider: "native",
    type: "schedule.fired",
    activation: "scheduled",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "real dispatch: arm→nextFireAt, before-tick fires 0 (baseline-first), at-tick fires exactly 1 via dispatchTriggerEvent, durable run terminal 'succeeded', resources cleaned (0 leaked); no provider/send",
  },
  // microsoft-excel:new_worksheet — Lane B polling beachhead. LIVE-certified via the
  // Excel polling smoke harness (tests/trigger-smoke/excelPollingSmoke.ts): a smoke
  // workbook is created, the real activation hook seeds the worksheet-name snapshot,
  // the FIRST per-trigger poll fires NOTHING from the pre-existing sheet
  // (baseline-first), a certified create_worksheet adds one sheet, the SECOND poll
  // fires exactly one run via the handler's enqueueRun whose trigger payload carries
  // the new worksheet name, the durable run reaches 'succeeded', then the whole
  // workbook is deleted (OneDrive recycle bin) — 0 leaked. (Flip to LIVE_PASS only
  // after the gated live run reports pass.)
  {
    provider: "microsoft-excel",
    type: "new_worksheet",
    activation: "polling",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "real polling dispatch: activation seeds worksheet snapshot, first poll fires 0 (baseline-first), a certified create_worksheet adds 1 sheet, the per-trigger poll fires exactly 1 run whose payload carries the new sheet name, durable run terminal 'succeeded', whole workbook deleted to OneDrive recycle bin (0 leaked)",
  },
  // microsoft-excel:new_row + new_table_row — Lane B create-polling family (same
  // harness as new_worksheet via the spec-driven runExcelPollingSmoke). new_row seeds
  // a baseline row (so the add appends at a NEW position key, not the empty-sheet
  // phantom), then add_row fires; new_table_row uses the table-bearing workbook whose
  // seed row is the baseline, then add_table_row fires. Both verify the marker value on
  // the fired run's trigger payload. (Flip to LIVE_PASS only after the gated live run.)
  {
    provider: "microsoft-excel",
    type: "new_row",
    activation: "polling",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "real polling dispatch: seed baseline row at pos 1, activation snapshots it, first poll fires 0 (baseline-first), certified add_row appends pos 2, the per-trigger poll fires exactly 1 run whose payload values carry the row marker, durable run terminal 'succeeded', whole workbook deleted (0 leaked)",
  },
  {
    provider: "microsoft-excel",
    type: "new_table_row",
    activation: "polling",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "real polling dispatch: table-bearing workbook seed row = baseline, activation snapshots it, first poll fires 0 (baseline-first), certified add_table_row appends a row, the per-trigger poll fires exactly 1 run whose payload values carry the marker, durable run terminal 'succeeded', whole workbook deleted (0 leaked)",
  },
  // microsoft-excel:updated_row + updated_table_row — Lane B value-change pair (same
  // spec-driven harness). The change MUTATES an existing baseline row in place via the
  // certified header-based update_row (column "Col"); the snapshot's row hash flips
  // while its key stays, so the poll fires via findChangedKeys. updated_row keeps the
  // worksheet position key "2" (no insert/delete → no position-shift); updated_table_row
  // keeps the stable Graph table-row key "0" (the table overlays the same worksheet cell
  // update_row writes). Both verify the mutated marker on the fired payload. (Flip to
  // LIVE_PASS only after the gated live run.)
  {
    provider: "microsoft-excel",
    type: "updated_row",
    activation: "polling",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "real value-change dispatch: seed header(row1)+data(row2), activation snapshots both, first poll fires 0 (baseline-first), certified update_row mutates row 2 IN PLACE (no position shift), the per-trigger poll fires exactly 1 via findChangedKeys whose payload values carry the mutated marker, durable run terminal 'succeeded', whole workbook deleted (0 leaked)",
  },
  {
    provider: "microsoft-excel",
    type: "updated_table_row",
    activation: "polling",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "real value-change dispatch: table workbook seed row = baseline (stable index 0), activation snapshots it, first poll fires 0 (baseline-first), certified update_row mutates the overlaid worksheet cell, the per-trigger poll fires exactly 1 via findChangedKeys on the SAME stable key whose payload values carry the mutated marker, durable run terminal 'succeeded', whole workbook deleted (0 leaked)",
  },
  // microsoft-onenote:new_note + updated_note — Lane B OneNote polling (section-scoped,
  // timestamp-cursor snapshot). OneNote has no section DELETE, so the smoke watches an
  // operator-provisioned smoke/test-named section (borrowed) and the smoke-owned resource
  // is the PAGE (certified create_page / update_page / delete_page). new_note: create_page
  // after the baseline fires "created"; updated_note: seed a baseline page (scoped via
  // config.pageId), then update_page bumps lastModifiedDateTime and fires "updated" (brand-new
  // pages are excluded by the handler). Payload metadata only — no body/bytes. (Flip to
  // LIVE_PASS only after the gated live run.)
  {
    provider: "microsoft-onenote",
    type: "new_note",
    activation: "polling",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "real polling dispatch: operator smoke section, activation seeds the createdDateTime cursor, first poll fires 0 (baseline-first), certified create_page after baseline fires exactly 1 run whose payload identifies the page (pageId + changeKind 'created' + title marker), durable run terminal 'succeeded', smoke page hard-deleted (0 leaked); borrowed section never deleted",
  },
  {
    provider: "microsoft-onenote",
    type: "updated_note",
    activation: "polling",
    status: "NOT_RUN",
    note: "harness authored + unit-tested, but BLOCKED for live cert by a Microsoft Graph behavior (probe-proven): update_page (the PATCH /pages/{id}/content endpoint) does NOT change the page's lastModifiedDateTime (stayed at creation time across 90s on pagesGet AND pagesList orderBy). updated_note fires only on lastModifiedDateTime > cursor, so an API content edit never fires it. No certified action mutates a page in a way that bumps lastModifiedDateTime; certifying would need a production change (out of lane). NOT a harness bug (new_note proves the path).",
  },
  // slack:channel_created — Lane C webhook beachhead. LIVE-certified via the Slack
  // webhook smoke harness (tests/trigger-smoke/slackWebhookSmoke.ts): a smoke-owned
  // {slack:channel_created → native no-op} workflow is armed via the real
  // registerWorkflowTriggers (Slack needs no provider-side subscription / no
  // integration — pure trigger_resources upsert; the stored event_type is the
  // canonical dispatch key slack.channel_created), the baseline has 0 runs, a fully
  // SYNTHETIC channel_created event_callback is signed with the REAL
  // SLACK_SIGNING_SECRET (Slack's v0:ts:body HMAC contract — production verification
  // UNWEAKENED) and POSTed to the REAL POST /api/webhooks/slack (real verify →
  // normalize → dispatchTriggerEvent → dedup → enqueue), exactly 1 durable run fires
  // whose trigger_event identifies the synthetic event (eventId + channel id +
  // channel-name marker), the run reaches terminal 'succeeded', re-sending the SAME
  // event_id is dropped by dedup (still 1 run), then the workflow + trigger_resources
  // + the synthetic dedup row are deleted. No real channel created, no send, metadata
  // only (no body/bytes/PII), 0 leaked.
  {
    provider: "slack",
    type: "channel_created",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "real synthetic-webhook dispatch: arm stores canonical event_type slack.channel_created, baseline 0, a SLACK_SIGNING_SECRET-signed synthetic channel_created event_callback POSTed to the real /api/webhooks/slack route (verify→normalize→dispatchTriggerEvent→enqueue) fires exactly 1 run whose trigger_event carries the synthetic eventId + channel marker, durable run terminal 'succeeded', re-send of the same event_id deduped (still 1 run), workflow+trigger_resources+dedup row cleaned (0 leaked); no real channel, no send, metadata only",
  },
  // native:manual.run — honestly classified, NOT a dispatch cert. It is exercised
  // end-to-end on every action workflow-live smoke, but via the run-now path
  // (enqueueRun), which deliberately bypasses dispatchTriggerEvent + trigger_resources.
  {
    provider: "native",
    type: "manual.run",
    activation: "manual",
    status: "RUN_NOW_PROVEN",
    date: "2026-06-29",
    note: "proven via the manual run-now path on every action workflow-live smoke; not a dispatch trigger",
  },
];
