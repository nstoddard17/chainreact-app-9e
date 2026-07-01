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
  // slack:file_shared — Lane C Slack webhook batch (same spec-driven harness as
  // channel_created via runSlackWebhookSmoke + FILE_SHARED_SPEC). A SYNTHETIC
  // file_shared event_callback is signed with the REAL SLACK_SIGNING_SECRET and
  // POSTed to the real /api/webhooks/slack route. The payload carries ONLY id stubs
  // (file_id / user_id / channel_id + a partial file:{id} stub — NO name / mimeType /
  // size / url / bytes / FileRef; the trigger payload never emits file content), all
  // smoke-minted (no real file / user / channel). normalize passes the inner event
  // through verbatim (no provider fetch). Identity = the synthetic file_id (marker) +
  // channel_id on the fired run; dedup proven on re-send; workflow + trigger_resources
  // + dedup row cleaned (0 leaked). No Slack API call, no send, metadata only.
  {
    provider: "slack",
    type: "file_shared",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "real synthetic-webhook dispatch: arm stores canonical event_type slack.file_shared, baseline 0, a SLACK_SIGNING_SECRET-signed synthetic file_shared event_callback (id stubs only — no name/bytes/FileRef) POSTed to the real /api/webhooks/slack route (verify→normalize→dispatchTriggerEvent→enqueue) fires exactly 1 run whose trigger_event carries the synthetic file_id + channel_id, durable run terminal 'succeeded', re-send of the same event_id deduped (still 1 run), workflow+trigger_resources+dedup row cleaned (0 leaked); no real file, no provider fetch, no send",
  },
  // github:new_commit — Lane C first DIRECT-SEEDED HMAC webhook cert. LIVE-certified
  // via the GitHub webhook smoke (tests/trigger-smoke/githubWebhookSmoke.ts). HONEST
  // SCOPE: this certifies the route/dispatch path only (receive → X-Hub-Signature-256
  // HMAC verify → normalize → dispatchTriggerEvent → dedup → enqueue → drain →
  // terminal). It DOES NOT certify GitHub provider-side subscription activation
  // (webhook create/delete via the GitHub API) — GitHub's real activation hook would
  // need a connected integration + a real repo, so the smoke DIRECT-SEEDS the minimum
  // trigger_resources row (provider github / eventType new_commit / keyed by
  // workflowId+nodeId) instead and makes NO GitHub API call, creates NO real webhook.
  // A fully synthetic push (smoke-minted owner/repo/sha/message) is signed with the
  // real GITHUB_WEBHOOK_SECRET and POSTed to the real /api/webhooks/github route;
  // production verification is UNWEAKENED. Identity = the X-GitHub-Delivery UUID +
  // repo + head commit sha on the fired run; dedup proven on re-send; seeded row +
  // workflow + dedup row cleaned (0 leaked). No commerce/billing, no send, no real repo.
  {
    provider: "github",
    type: "new_commit",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "route/dispatch cert via DIRECT-SEED (NOT provider activation): seed trigger_resources event_type new_commit, baseline 0, a GITHUB_WEBHOOK_SECRET-signed synthetic push (sha256=<hex> over raw body; smoke-minted owner/repo/sha) POSTed to the real /api/webhooks/github?workflowId&nodeId route (verify→normalize→dispatchTriggerEvent→enqueue) fires exactly 1 run whose trigger_event carries the X-GitHub-Delivery UUID + repo + head commit sha, durable run terminal 'succeeded', re-send of the same delivery id deduped (still 1 run), seeded row+workflow+dedup row cleaned (0 leaked); no GitHub API call, no real webhook/repo, no send. Provider-side webhook activation NOT certified.",
  },
  // trello:new_card — Lane C second DIRECT-SEEDED HMAC webhook cert (after github).
  // LIVE-certified via the Trello webhook smoke (tests/trigger-smoke/trelloWebhookSmoke.ts).
  // HONEST SCOPE: route/dispatch only (receive → X-Trello-Webhook HMAC-SHA1 verify
  // over rawBody+callbackURL → classify → event-type filter → normalize →
  // dispatchTriggerEvent → dedup → enqueue → drain → terminal). DOES NOT certify
  // Trello provider-side subscription activation (POST /1/webhooks create/delete via
  // the Trello API). Trello's real activation hook needs a connected integration + a
  // real board, so the smoke DIRECT-SEEDS the minimum trigger_resources row (provider
  // trello / eventType new_card / config { callbackURL, eventType, boardId }) and
  // makes NO Trello API call, creates NO real webhook. Trello's HMAC binds the
  // callbackURL: the smoke seeds a known callbackURL on the row AND signs with that
  // same string, so verification passes without a real Trello-registered URL and
  // production verification is UNWEAKENED. A fully synthetic createCard payload
  // (smoke-minted board/card/list ids + card name) is signed with the real
  // TRELLO_CLIENT_SECRET and POSTed to the real /api/webhooks/trello route. Identity =
  // the Trello action id + card id + board id on the fired run; dedup proven on
  // re-send; seeded row + workflow + dedup row cleaned (0 leaked). Lifecycle card
  // created — no comment text, no member data, no commerce, no send.
  {
    provider: "trello",
    type: "new_card",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "route/dispatch cert via DIRECT-SEED (NOT provider activation): seed trigger_resources event_type new_card + config{callbackURL,eventType,boardId}, baseline 0, a TRELLO_CLIENT_SECRET-signed synthetic createCard (X-Trello-Webhook base64 HMAC-SHA1 over rawBody+the SEEDED callbackURL; smoke-minted board/card ids) POSTed to the real /api/webhooks/trello?workflowId&nodeId route (verify→classify→filter→normalize→dispatchTriggerEvent→enqueue) fires exactly 1 run whose trigger_event carries the Trello action id + card id + board id, durable run terminal 'succeeded', re-send of the same action id deduped (still 1 run), seeded row+workflow+dedup row cleaned (0 leaked); no Trello API call, no real webhook/board, no send. Provider-side webhook activation NOT certified.",
  },
  // trello:card_moved / card_archived / card_updated — Lane C Trello lifecycle batch
  // on the SAME spec-driven direct-seed harness as new_card (runTrelloWebhookSmoke +
  // CARD_MOVED_SPEC / CARD_ARCHIVED_SPEC / CARD_UPDATED_SPEC). Each is a fully
  // smoke-minted `updateCard` action whose data shape drives the real classifier:
  // card_moved = differing listBefore/listAfter (NO old.closed); card_archived =
  // data.old.closed present (archive-priority branch); card_updated = a generic
  // data.old change (a smoke name change) with no closed and no list move. Same honest
  // scope as new_card: route/dispatch cert via DIRECT-SEED (TRELLO_CLIENT_SECRET-signed
  // synthetic webhook to the real /api/webhooks/trello route, callbackURL-bound HMAC
  // verified against the seeded config.callbackURL), NOT provider-side activation. No
  // Trello API, no real webhook/board, no comment text, no member identity, no send.
  {
    provider: "trello",
    type: "card_moved",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "route/dispatch cert via DIRECT-SEED (NOT activation): seed event_type card_moved, baseline 0, a TRELLO_CLIENT_SECRET-signed synthetic updateCard (differing listBefore/listAfter, no old.closed) POSTed to the real /api/webhooks/trello route classifies to trello.card.moved, fires exactly 1 run whose trigger_event carries the action id + card id + board id + from/to list ids, durable run terminal 'succeeded', same action id deduped (still 1), seeded row+workflow+dedup row cleaned (0 leaked); no Trello API, no real webhook/board.",
  },
  {
    provider: "trello",
    type: "card_archived",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "route/dispatch cert via DIRECT-SEED (NOT activation): seed event_type card_archived, baseline 0, a TRELLO_CLIENT_SECRET-signed synthetic updateCard (data.old.closed present, card.closed=true) POSTed to the real /api/webhooks/trello route classifies to trello.card.archived (archive-priority branch), fires exactly 1 run whose trigger_event carries the action id + card id + board id + closed=true, durable run terminal 'succeeded', same action id deduped (still 1), seeded row+workflow+dedup row cleaned (0 leaked); no Trello API, no real webhook/board.",
  },
  {
    provider: "trello",
    type: "card_updated",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-06-29",
    note: "route/dispatch cert via DIRECT-SEED (NOT activation): seed event_type card_updated, baseline 0, a TRELLO_CLIENT_SECRET-signed synthetic updateCard (generic data.old name change, no closed, no list move) POSTed to the real /api/webhooks/trello route classifies to trello.card.updated, fires exactly 1 run whose trigger_event carries the action id + card id + board id + changedFields including 'name', durable run terminal 'succeeded', same action id deduped (still 1), seeded row+workflow+dedup row cleaned (0 leaked); no Trello API, no real webhook/board.",
  },
  // monday:new_item / item_moved / new_subitem — Lane C Monday lifecycle batch on the
  // spec-driven direct-seed harness (runMondayWebhookSmoke + makeRealMondayWebhookSmokeDeps,
  // tests/trigger-smoke/mondayWebhookSmoke.ts). LIVE-certified via the Monday webhook
  // smoke. Monday signs the RAW BODY only (x-monday-signature = lowercase-hex
  // HMAC-SHA256 over the raw body, keyed MONDAY_SIGNING_SECRET) — simpler than Trello's
  // callbackURL-bound HMAC. Same scope as trello: route/dispatch cert via DIRECT-SEED
  // (a MONDAY_SIGNING_SECRET-signed synthetic { event } POSTed to the real
  // /api/webhooks/monday route; smoke-minted board/item/group ids; no Monday API, no
  // real webhook/board/item). EXCLUDED (un-certified, user-content semantics): new_update
  // (user-authored update body text) + column_changed (column value content) — the
  // Monday analog of Trello's excluded comment_added / member_changed.
  {
    provider: "monday",
    type: "new_item",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-06-30",
    note: "route/dispatch cert via DIRECT-SEED (NOT provider activation): seed trigger_resources event_type new_item + config{eventType,boardId}, baseline 0, a MONDAY_SIGNING_SECRET-signed synthetic { event:{type:create_item} } (x-monday-signature lowercase-hex HMAC-SHA256 over the raw body; smoke-minted board/item/group ids) POSTed to the real /api/webhooks/monday?workflowId&nodeId route (verify->classify->event-type filter->normalize->dispatchTriggerEvent->enqueue) fires exactly 1 run whose trigger_event carries the deterministic dedup key new_item:board:item:createdAt + itemId + boardId + groupId + changeKind, durable run terminal 'succeeded', re-send of the same event deduped (still 1 run), seeded row+workflow+dedup row cleaned (0 leaked); no Monday API call, no real webhook/board/item, no send. Provider-side webhook activation NOT certified.",
  },
  {
    provider: "monday",
    type: "item_moved",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-06-30",
    note: "route/dispatch cert via DIRECT-SEED (NOT activation): seed event_type item_moved, baseline 0, a MONDAY_SIGNING_SECRET-signed synthetic { event:{type:item_moved_to_any_group} } (smoke-minted board/item + source/dest group ids) POSTed to the real /api/webhooks/monday route classifies to item_moved, fires exactly 1 run whose trigger_event carries the dedup key item_moved:board:item:movedAt + itemId + boardId + previousGroupId + currentGroupId + changeKind, durable run terminal 'succeeded', same event deduped (still 1), seeded row+workflow+dedup row cleaned (0 leaked); no Monday API, no real webhook/board/item.",
  },
  {
    provider: "monday",
    type: "new_subitem",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-06-30",
    note: "route/dispatch cert via DIRECT-SEED (NOT activation): seed event_type new_subitem, baseline 0, a MONDAY_SIGNING_SECRET-signed synthetic { event:{type:create_subitem} } (smoke-minted board + subitem pulseId + parentItemId; itemId intentionally omitted so subitem vs parent never conflate) POSTed to the real /api/webhooks/monday route classifies to new_subitem, fires exactly 1 run whose trigger_event carries the dedup key new_subitem:board:subitem:createdAt + subitemId + parentItemId + boardId + changeKind, durable run terminal 'succeeded', same event deduped (still 1), seeded row+workflow+dedup row cleaned (0 leaked); no Monday API, no real webhook/board/item.",
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
