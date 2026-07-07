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
  // slack:member_joined_channel / member_left_channel / reaction_added /
  // reaction_removed — Lane C Slack metadata webhook batch (2026-07-06), same
  // spec-driven synthetic-webhook harness as channel_created (runSlackWebhookSmoke +
  // the new specs). Each SLACK_SIGNING_SECRET-signed synthetic event_callback is
  // POSTed to the real /api/webhooks/slack route (verify→normalize→
  // dispatchTriggerEvent→dedup→enqueue). member_* carry ONLY channel + user id stubs;
  // reaction_* carry a standard emoji NAME + a message-item reference (channel + ts)
  // with NO message body/text. All ids smoke-minted (no real channel/user/message, no
  // PII). Empty trigger config = match-all (each filter returns match on unset
  // config). Same honest scope as channel_created: route/dispatch cert, no provider
  // fetch, no send. message.* (message body) stays OUT of this metadata scope.
  {
    provider: "slack",
    type: "member_joined_channel",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real synthetic-webhook dispatch: arm stores slack.member_joined_channel, baseline 0, a SLACK_SIGNING_SECRET-signed synthetic member_joined_channel event_callback (channel+user id stubs only) POSTed to the real /api/webhooks/slack route fires exactly 1 run whose trigger_event carries the eventId + channel + user, durable run terminal 'succeeded', same event_id deduped (still 1), workflow+trigger_resources+dedup row cleaned (0 leaked); no real channel/user, no send, metadata only",
  },
  {
    provider: "slack",
    type: "member_left_channel",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real synthetic-webhook dispatch: arm stores slack.member_left_channel, baseline 0, a SLACK_SIGNING_SECRET-signed synthetic member_left_channel event_callback (channel+user id stubs only) POSTed to the real /api/webhooks/slack route fires exactly 1 run whose trigger_event carries the eventId + channel + user, durable run terminal 'succeeded', same event_id deduped (still 1), workflow+trigger_resources+dedup row cleaned (0 leaked); no real channel/user, no send, metadata only",
  },
  {
    provider: "slack",
    type: "reaction_added",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real synthetic-webhook dispatch: arm stores slack.reaction_added, baseline 0, a SLACK_SIGNING_SECRET-signed synthetic reaction_added event_callback (standard emoji name + item{channel,ts}, NO message body) POSTed to the real /api/webhooks/slack route fires exactly 1 run whose trigger_event carries the eventId + reaction + item channel, durable run terminal 'succeeded', same event_id deduped (still 1), workflow+trigger_resources+dedup row cleaned (0 leaked); no real message/user, no send, metadata only",
  },
  {
    provider: "slack",
    type: "reaction_removed",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real synthetic-webhook dispatch: arm stores slack.reaction_removed, baseline 0, a SLACK_SIGNING_SECRET-signed synthetic reaction_removed event_callback (standard emoji name + item{channel,ts}, NO message body) POSTed to the real /api/webhooks/slack route fires exactly 1 run whose trigger_event carries the eventId + reaction + item channel, durable run terminal 'succeeded', same event_id deduped (still 1), workflow+trigger_resources+dedup row cleaned (0 leaked); no real message/user, no send, metadata only",
  },
  // slack:message.channel / message.group / message.im / message.mpim — Lane C Slack
  // MESSAGE webhook batch (2026-07-06), same spec-driven synthetic-webhook harness
  // (runSlackWebhookSmoke + the MESSAGE_* specs). Policy decision: synthetic signed
  // Slack message events are acceptable for trigger-smoke when they pass through the
  // real route — this certifies the V2 webhook ingestion path for the Slack event
  // shape (HMAC verify → route parse → normalize → dispatch → filter → dedup →
  // enqueue → terminal run); it does NOT claim Slack delivered the event. Unlike the
  // metadata batch, the message events DO carry a `text` body because the trigger
  // contract requires it (meta payloadShape lists `text`) — the text is a fully
  // smoke-minted deterministic `crsmoke` marker string (the synthetic event_id), NO
  // user content / PII / real message, and the fired run's identity check proves the
  // normalizer preserved the marker verbatim. The four kinds exercise the
  // normalizer's channel_type-authoritative kind derivation (channel/group/im/mpim →
  // slack.message.<kind>; group = modern private channel with C-prefixed id; im/mpim
  // use shape-faithful D…/G… ids). message.channel additionally ran a FILTERED
  // variant live: config.channelId pinned to a regex-valid id → real filter Zod
  // config parse + positive channel match inside real dispatch (the no-match drop
  // stays unit-proven at the filter layer). No Slack API call, no OAuth token, no
  // send; normalize passes the inner event through verbatim (no provider fetch).
  {
    provider: "slack",
    type: "message.channel",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real synthetic-webhook dispatch: arm stores slack.message.channel, baseline 0, a SLACK_SIGNING_SECRET-signed synthetic message event_callback (channel_type 'channel', smoke-minted crsmoke marker text — no user content) POSTed to the real /api/webhooks/slack route fires exactly 1 run whose trigger_event preserves the eventId + channel + marker text verbatim, durable run terminal 'succeeded', same event_id deduped (still 1), rows cleaned (0 leaked); ALSO live-proven with config.channelId set (real filter Zod parse + positive match in dispatch); ingestion-path cert — does not claim Slack delivered",
  },
  {
    provider: "slack",
    type: "message.group",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real synthetic-webhook dispatch: arm stores slack.message.group, baseline 0, a SLACK_SIGNING_SECRET-signed synthetic message event_callback (channel_type 'group' — modern private channel with C-prefixed id, the Slack 2.2 authoritative branch; smoke-minted crsmoke marker text) POSTed to the real /api/webhooks/slack route fires exactly 1 run preserving eventId + channel + marker verbatim, terminal 'succeeded', same event_id deduped (still 1), rows cleaned (0 leaked); ingestion-path cert — does not claim Slack delivered",
  },
  {
    provider: "slack",
    type: "message.im",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real synthetic-webhook dispatch: arm stores slack.message.im, baseline 0, a SLACK_SIGNING_SECRET-signed synthetic message event_callback (channel_type 'im', shape-faithful D-prefixed channel id, smoke-minted crsmoke marker text) POSTed to the real /api/webhooks/slack route fires exactly 1 run preserving eventId + channel + marker verbatim, terminal 'succeeded', same event_id deduped (still 1), rows cleaned (0 leaked); match-all default config (withUserId unset); ingestion-path cert — does not claim Slack delivered",
  },
  {
    provider: "slack",
    type: "message.mpim",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real synthetic-webhook dispatch: arm stores slack.message.mpim, baseline 0, a SLACK_SIGNING_SECRET-signed synthetic message event_callback (channel_type 'mpim', shape-faithful G-prefixed channel id, smoke-minted crsmoke marker text) POSTed to the real /api/webhooks/slack route fires exactly 1 run preserving eventId + channel + marker verbatim, terminal 'succeeded', same event_id deduped (still 1), rows cleaned (0 leaked); ingestion-path cert — does not claim Slack delivered",
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
  // asana:new_task_in_project / task_updated_in_project — the FIRST full
  // provider-boundary live certs in this seed (stronger scope than the
  // direct-seed entries above): REAL registerWorkflowTriggers -> POST /webhooks
  // -> X-Hook-Secret handshake against the DEPLOYED production receive route
  // (shared dev Supabase) -> REAL task events -> production signature-verify ->
  // dispatch -> cron drain -> terminal run -> REAL unregisterWorkflowTriggers ->
  // DELETE /webhooks proven gone by a second delete reading 404. The live run
  // SURFACED a real bug: one task creation delivers task+added twice (one
  // membership event per parent — project + section, created_at ms apart), so
  // the timestamp-bearing dedup key fired 2 runs; fixed to a task-scoped key
  // (new_task_in_project:<project>:<task>) and re-proven on the direct-seed
  // harness. The fix is LOCAL until v2-main deploys — re-run the live script
  // (scripts/trash/asana-live-trigger-smoke.ts) post-deploy for the
  // exactly-one-run proof. Redelivery dedup + wrong-project drop remain
  // direct-seed/unit-proven (cannot be forced live; single-project workspace).
  {
    provider: "asana",
    type: "new_task_in_project",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-04",
    note: "FULL live provider-boundary cert: real activation handshake vs production, real task creation fired a terminal 'succeeded' run via production dispatch+drain, real DELETE /webhooks 404-proven; surfaced+fixed the multi-parent task+added double-fire (dedup key now task-scoped, timestamp-free); fix local until deploy — post-deploy live rerun expected to show exactly 1 run",
  },
  {
    provider: "asana",
    type: "task_updated_in_project",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-04",
    note: "FULL live provider-boundary cert: real activation handshake vs production, real task rename fired EXACTLY ONE terminal 'succeeded' run via production dispatch+drain (identity matched: task/project/changeKind), real DELETE /webhooks 404-proven, trigger rows cleaned",
  },
  // ASANA-2 (2026-07-06): 3 additional project-webhook triggers sharing the
  // ASANA-1 lifecycle (same handshake/signature/dispatch path; unit +
  // receive-path proven). NOT_RUN until owner setup lands: the app needs the
  // new stories:read scope added in the Asana console + user re-consent, and
  // the deployed receive route must contain the ASANA-2 commit before a live
  // cert can run (comment_added_to_task post-fetches GET /stories/{gid}).
  {
    provider: "asana",
    type: "task_completed",
    activation: "webhook",
    status: "NOT_RUN",
    note: "ASANA-2: unit + receive-path proven (post-fetch completed===true gate, task-scoped timestamp-free dedup key); live cert pending owner setup (re-consent for stories:read batch) + deploy",
  },
  {
    provider: "asana",
    type: "task_assigned",
    activation: "webhook",
    status: "NOT_RUN",
    note: "ASANA-2: unit + receive-path proven (post-fetch assignee gate, (task,assignee)-scoped timestamp-free dedup key, optional assignee filter); live cert pending owner setup + deploy",
  },
  {
    provider: "asana",
    type: "comment_added_to_task",
    activation: "webhook",
    status: "NOT_RUN",
    note: "ASANA-2: unit + receive-path proven (story post-fetch via NEW stories:read scope, story-gid dedup key, comment text truncated + sensitive-marked); live cert pending owner setup (stories:read in Asana console + re-consent) + deploy",
  },
  // typeform:new_response_in_form — full provider-boundary live cert (Phase 13,
  // scripts/trash/typeform-live-cert.ts): REAL registerWorkflowTriggers ->
  // PUT /forms/{id}/webhooks/{tag} against live Typeform with the V2-minted
  // secret and NO event_types in the body (ambiguity resolved live: optional,
  // defaults to form_response) -> a REAL response submitted through the public
  // form UI -> production signature-verify (sha256= + base64 HMAC) -> dispatch
  // -> cron drain -> terminal run -> REAL unregisterWorkflowTriggers ->
  // DELETE proven gone by a second delete reading 404. Live refresh+ROTATION
  // also proven via dispatcher.refresh (rotated refresh token persisted, new
  // pair live-usable). Redelivery dedup + wrong-form drop remain
  // direct-seed/unit-proven (Typeform retries only on failure; single-form
  // account) — same honesty boundary as the Asana entries.
  {
    provider: "typeform",
    type: "new_response_in_form",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-04",
    note: "FULL live provider-boundary cert: real PUT webhook (no event_types — proven optional), real public-form response fired EXACTLY ONE terminal 'succeeded' run via production signature-verify+dispatch+drain (identity matched: formId/responseToken/changeKind; token-scoped eventId; bounded answers projection; response_url absent), real DELETE 404-proven, rows cleaned; live refresh-token ROTATION persisted and new pair live-usable",
  },
  // calendly:event_scheduled + event_canceled — full provider-boundary live cert
  // (Phase 13, scripts/trash/calendly-live-cert.ts + calendly-live-book.ts,
  // 2026-07-05): REAL registerWorkflowTriggers -> POST /webhook_subscriptions
  // (scope user, V2-minted signing_key) -> real bookings/cancellations/reschedule
  // on the live scheduling page -> production t=,v1= signature verify -> dispatch
  // -> cron drain -> terminal runs -> DELETE 404-proven. Reschedule live-observed:
  // canceled half rescheduled=true + new_invitee set; NEW-booking half
  // rescheduled=false + old_invitee set. P-S2 eventTypeId no-match proven live
  // (mismatch-filter workflow stayed at 0 runs across 3 bookings).
  {
    provider: "calendly",
    type: "event_scheduled",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-05",
    note: "FULL live provider-boundary cert: real POST /webhook_subscriptions (scope user), 3 real bookings (incl. the reschedule's new half, oldInviteeId set) each fired EXACTLY ONE terminal 'succeeded' run via production t=,v1= signature-verify+dispatch+drain; subscriber-scoped timestamp-free eventId; embedded scheduled_event present live; eventTypeId filter match AND no-match (0 runs on mismatch workflow) proven live; real DELETE 404-proven, rows+dedup cleaned; live refresh ROTATION persisted",
  },
  {
    provider: "calendly",
    type: "event_canceled",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-05",
    note: "FULL live provider-boundary cert: 3 real cancellations (true cancel with cancellation{canceledBy,reason,cancelerType}; reschedule's canceled half rescheduled=true + newInviteeId set; cleanup cancel) each fired EXACTLY ONE terminal 'succeeded' run via production signature-verify+dispatch+drain; real DELETE 404-proven, rows+dedup cleaned",
  },
  // Consolidated-webhook batch (2026-07-06) — stripe / shopify / hubspot /
  // mailchimp on the NEW generic direct-seed orchestrator
  // (tests/trigger-smoke/directSeedWebhookSmoke.ts + per-provider specs/deps).
  // Same honest scope as github:new_commit: V2 INGESTION-PATH certs via
  // DIRECT-SEED (no provider API call, no real subscription, NOT provider
  // activation, no claim the provider delivered). All payloads fully
  // smoke-minted crsmoke markers; unit tests additionally cross-check every
  // synthetic body against the provider's REAL signature verifier, REAL
  // normalizer, and REAL allowlist.
  {
    provider: "stripe",
    type: "event_received",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "ingestion-path cert via DIRECT-SEED (NOT activation): seed trigger_resources event_type event_received + config{endpointSecret} (SMOKE-MINTED whsec — Stripe's per-row secret model, no env secret), baseline 0, a t=,v1= signed synthetic allowlisted checkout.session.completed (smoke-minted evt_crsmoke/cs_crsmoke ids, no PII/amounts) POSTed to the real /api/webhooks/stripe?workflowId&nodeId route (verify vs seeded secret->allowlist->normalize->dispatchTriggerEvent->enqueue) fires exactly 1 run whose trigger_event carries the evt id + stripeEventType + session-id marker, durable run terminal 'succeeded', same evt id deduped (still 1), rows cleaned (0 leaked); no Stripe API, no real endpoint. Provider-side endpoint activation NOT certified.",
  },
  {
    provider: "shopify",
    type: "webhook_received",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "ingestion-path cert via DIRECT-SEED (NOT activation): seed trigger_resources event_type webhook_received + config{topics:[orders/create]}, baseline 0, a SHOPIFY_CLIENT_SECRET-signed (X-Shopify-Hmac-SHA256 base64 over raw body) synthetic orders/create snapshot (smoke-minted shop domain/order id/crsmoke order name, test:true, no customer PII/line items) POSTed to the real /api/webhooks/shopify?workflowId&nodeId route (verify->per-row topic allowlist->normalize->dispatchTriggerEvent->enqueue) fires exactly 1 run whose trigger_event keys on the X-Shopify-Webhook-Id + topic + verbatim body markers, durable run terminal 'succeeded', same webhook id deduped (still 1), rows cleaned (0 leaked); no Shopify API, no real webhook/shop. Provider-side webhook activation NOT certified.",
  },
  {
    provider: "hubspot",
    type: "webhook_received",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "ingestion-path cert via DIRECT-SEED (NOT activation): seed hubspot_app_subscriptions (REAL env HUBSPOT_APP_ID + contact.creation, smoke-minted hubspotSubscriptionId; reused-not-deleted if pre-existing) + hubspot_subscription_refs (smoke-minted portal id -> workflow node), baseline 0, a HUBSPOT_CLIENT_SECRET-signed (V3 canonical string method+uri+body+timestamp, base64 HMAC, canonical URI mirrors the route's env resolution) synthetic one-event array (crsmoke event/portal/object ids, no contact properties/PII) POSTed to the real /api/webhooks/hubspot route (verify->app-sub+ref routing->ROUTE-LEVEL dedup markSeen->per-ref enqueueRun; NOTE: HubSpot's shared-subscription model bypasses dispatchTriggerEvent by design) fires exactly 1 run whose trigger_event carries the eventId + subscriptionType + portal + object-id marker, durable run terminal 'succeeded', same eventId deduped (still 1), ref row + created app-sub row + workflow + dedup row cleaned (0 leaked); no HubSpot API. Provider-side subscription activation NOT certified.",
  },
  {
    provider: "mailchimp",
    type: "audience_event",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "ingestion-path cert via DIRECT-SEED (NOT activation): seed trigger_resources event_type audience_event + config{audienceId,eventTypes:[subscribe]} + smoke providerAccountId, baseline 0, an UNSIGNED (Mailchimp has NO signature scheme — the production authenticity model IS URL secrecy + audience gate + allowlist + sha256(rawBody) dedup) synthetic form-encoded subscribe event (crsmoke audience id + crsmoke-…@example.invalid email, reserved TLD, no real subscriber) POSTed to the real /api/webhooks/mailchimp?workflowId&nodeId route (parse->audience gate->event-type allowlist->normalize->dispatchTriggerEvent->content-hash dedup->enqueue) fires exactly 1 run whose trigger_event keys on sha256(rawBody) + preserves the email/subscriber-hash markers, durable run terminal 'succeeded', re-send of the IDENTICAL bytes deduped (still 1), rows cleaned (0 leaked); no Mailchimp API, no real webhook/audience. Provider-side webhook activation NOT certified.",
  },
  // airtable:record_changed — BLOCKED for direct-seed certification, probe-read
  // 2026-07-06 (integrations/airtable/webhooks/receive.ts + triggers/
  // recordChanged/pull.ts). Airtable's webhook ping carries NO record data
  // ({base:{id},webhook:{id},timestamp} only); after MAC verification the
  // receive path MUST pull actual changes from the Airtable API
  // (webhooksListPayloads via refreshAndRetry), which requires an ACTIVE
  // connected Airtable integration (getActiveForExecution) + a real Airtable
  // webhook payload feed + cursor state. Without those, a synthetic signed
  // ping yields zero events by design (no integration -> empty pull) — there
  // is nothing to certify without faking the provider fetch, which would NOT
  // be the real path. Certification requires a Phase-13-style live cert with
  // a connected Airtable account (real webhook, real record change, real
  // payload pull).
  {
    provider: "airtable",
    type: "record_changed",
    activation: "webhook",
    status: "MISSING_HARNESS",
    note: "BLOCKED for direct-seed: Airtable pings are notification-only (no record data); receive->pull requires a live connected Airtable integration + real webhooksListPayloads fetch + cursor state that cannot be honestly seeded. Needs a Phase-13-style live cert (real OAuth, real webhook, real record change). MAC verify layer itself is unit-tested in the receive-path suites.",
  },
];
