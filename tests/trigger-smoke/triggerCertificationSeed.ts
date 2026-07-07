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
  // ASANA-1 lifecycle. FULL provider-boundary live certs same day
  // (scripts/trash/asana2-live-trigger-smoke.ts) after owner setup landed
  // (stories:read added in the Asana console, v2-main deployed, Asana
  // reconnected/re-consented): real POST /webhooks + X-Hook-Secret handshake
  // vs the deployed chainreact.app receive route, real provider events,
  // production dispatch + drain to terminal 'succeeded', per-phase NEGATIVE
  // cases held at 0 extra runs, real DELETE /webhooks proven gone by a
  // second delete reading 404, trigger rows cleaned. stories:read proven
  // live twice: a pre-flight GET /stories/{gid} probe + the comment run's
  // production post-fetch.
  {
    provider: "asana",
    type: "task_completed",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "FULL live cert: plain rename fired NOTHING (fields filter + post-fetch gate), real completion fired EXACTLY ONE terminal 'succeeded' run with the timestamp-free task-scoped eventId, DELETE /webhooks 404-proven, rows cleaned",
  },
  {
    provider: "asana",
    type: "task_assigned",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "FULL live cert: real assignment fired EXACTLY ONE terminal 'succeeded' run carrying the post-fetched newAssigneeGid, UNassignment fired NOTHING (post-fetch gate), (task,assignee)-scoped timestamp-free eventId, DELETE /webhooks 404-proven, rows cleaned",
  },
  {
    provider: "asana",
    type: "comment_added_to_task",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "FULL live cert: real comment fired EXACTLY ONE terminal 'succeeded' run with commentText+authorName from the production stories:read post-fetch, completing the task (marked_complete system story) fired NOTHING, story-gid eventId, DELETE /webhooks 404-proven, rows cleaned",
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
  // Gmail polling batch (2026-07-06) — the 3 registered Gmail history-cursor
  // polling triggers on the spec-driven Gmail polling harness
  // (tests/trigger-smoke/gmailPollingSmoke.ts). These are FULL Lane B
  // live-provider certs against the action-certified smoke Gmail account:
  // real activation (usersGetProfile seeds snapshot.historyId — the V1
  // "first poll miss" rule), real users.history.list walks, real
  // messages.get hydration, and run-unique crsmoke marker seeds via the
  // CERTIFIED send_email / create_label / add_label handlers + the proven
  // smoke multipart attachment helper. No reliance on arbitrary mailbox
  // history. Each cert proves BOTH freshness layers separately: WATERMARK
  // (an advanced-cursor re-poll fires 0 more) and DEDUP (the cursor is
  // REWOUND to pre-change, history re-surfaces the same message id, and the
  // per-trigger-prefixed webhook_event_dedup row drops it). Seed messages
  // trashed, smoke labels deleted, dedup rows removed — 0 leaked.
  {
    provider: "gmail",
    type: "new_email",
    activation: "polling",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real polling dispatch vs live Gmail: activation seeds snapshot.historyId, baseline poll fires 0, a certified send_email self-send with a run-unique crsmoke subject (trigger config pins subject exact-match + no label constraint = deterministic vs concurrent mail) fires exactly 1 run whose trigger_event carries the bare-message-id eventId + marker subject, durable run terminal 'succeeded', advanced-cursor re-poll fires 0 (watermark), REWOUND-cursor re-poll re-surfaces the message and webhook_event_dedup drops it (still 1), seed trashed + rows cleaned (0 leaked)",
  },
  {
    provider: "gmail",
    type: "new_labeled_email",
    activation: "polling",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real polling dispatch vs live Gmail: certified create_label mints a run-unique smoke label (trigger config labelId), activation seeds the cursor, baseline poll fires 0, certified send_email + add_label produce the labelsAdded history event that fires exactly 1 run whose trigger_event carries eventId labeled:<messageId> + labelAppliedId + our label in labelsAdded + marker subject (the send alone does NOT fire it — messagesAdded is ignored by this trigger), terminal 'succeeded', watermark + rewound-cursor dedup (labeled: prefixed key) hold at 1, seed trashed + smoke label deleted + rows cleaned (0 leaked)",
  },
  {
    provider: "gmail",
    type: "new_attachment",
    activation: "polling",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real polling dispatch vs live Gmail: activation seeds the cursor, baseline poll fires 0, the proven smoke multipart self-send (send_email has no attachments field) delivers ONE message with a crsmoke-named text attachment; the poll's format=full hydration + extractAttachmentMetadata fire exactly 1 run whose trigger_event carries eventId attachment:<messageId> + the marker filename in payload.attachments, terminal 'succeeded', watermark + rewound-cursor dedup (attachment: prefixed key) hold at 1, seed trashed + rows cleaned (0 leaked)",
  },
  // Mailchimp polling batch (2026-07-06) — 3 of the 6 registered Mailchimp
  // polling triggers on the spec-driven Mailchimp polling harness
  // (tests/trigger-smoke/mailchimpPollingSmoke.ts). FULL Lane B live-provider
  // certs against the action-certified smoke account's audience: real
  // activation baselines, real segments/campaigns API reads, and run-unique
  // crsmoke seeds via the CERTIFIED add_subscriber / add_tag /
  // remove_subscriber(delete_permanent) handlers (Mailchimp TAGS are static
  // segments, so add_tag both mints the smoke segment and adds the member).
  // Smoke-only inline calls (via the shared mailchimpRequest helper) exist
  // only where no wrapper/action does: campaign create+delete (a DRAFT that
  // is NEVER sent), segment rename (the deterministic observable), segment
  // delete (cleanup). Freshness proven in two isolated layers per cert:
  // WATERMARK (absorbed-snapshot re-poll fires 0) and DEDUP (the exact
  // pre-change snapshot JSON is RESTORED, the poller re-detects the change,
  // and the per-trigger webhook_event_dedup key drops it). NO mail sent at
  // any point; members permanently deleted, tag segment + draft campaign
  // deleted, dedup rows removed — 0 leaked.
  {
    provider: "mailchimp",
    type: "subscriber_added_to_segment",
    activation: "polling",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real polling dispatch vs live Mailchimp: prepare seeds member A + marker tag (=static segment) settle-confirmed, activation snapshots the member-hash set, baseline poll fires 0, certified add_subscriber+add_tag on plus-addressed member B fires exactly 1 run whose trigger_event carries eventId subscriber_added_to_segment:<seg>:<hash> + B's crsmoke email, terminal 'succeeded', absorbed-snapshot re-poll fires 0 (watermark), RESTORED pre-change snapshot re-poll re-detects B and dedup drops it (still 1), members delete_permanent + segment deleted + rows cleaned (0 leaked)",
  },
  {
    provider: "mailchimp",
    type: "segment_updated",
    activation: "polling",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real polling dispatch vs live Mailchimp: activation snapshots the segment's observed state, baseline poll fires 0, a smoke-only RENAME of the marker tag segment (the record's primary field; live probe showed the member-count aggregate lags minutes behind segmentMembersList, so the count is NOT the smoke observable) fires exactly 1 run whose trigger_event carries the renamed marker name + eventId segment_updated:<seg>:<updatedAt>, terminal 'succeeded', watermark re-poll fires 0, RESTORED-snapshot re-poll re-detects and dedup (updatedAt-keyed) drops it (still 1), member delete_permanent + segment deleted + rows cleaned (0 leaked)",
  },
  {
    provider: "mailchimp",
    type: "campaign_created",
    activation: "polling",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "real polling dispatch vs live Mailchimp: activation snapshots known campaign ids (config.audienceId narrows to the smoke audience), baseline poll fires 0, a smoke-only inline DRAFT campaign create (type regular, marker title, NEVER sent — creation sends no mail) fires exactly 1 run whose trigger_event carries eventId campaign_created:<id> + the marker title + audienceId, terminal 'succeeded', watermark re-poll fires 0, RESTORED-snapshot re-poll re-detects and dedup (campaign-id-keyed) drops it (still 1), draft campaign deleted + rows cleaned (0 leaked)",
  },
  // Microsoft Graph webhook batch (2026-07-06) — all 6 registered Microsoft
  // change-notification triggers on the generic direct-seed orchestrator +
  // the Graph specs (tests/trigger-smoke/microsoftGraphWebhookSmoke.ts).
  // HYBRID HONESTY SCOPE: the notification is SYNTHETIC (direct-seeded
  // trigger_resources row with smoke-minted subscriptionId + clientState; NO
  // Graph subscription created; Microsoft did NOT deliver), but the RESOURCE
  // is REAL — seeded via the certified action-smoke patterns and re-fetched
  // from LIVE Graph by the production receive path (validation handshake +
  // clientState verify + hydration fetch + receive-time filters + normalize
  // + dispatchTriggerEvent + dedup all UNCHANGED). Certifies the V2 ingestion
  // path per event shape; Graph subscription activation/renewal NOT
  // certified. Every route's validation-handshake branch also live-probed
  // (?validationToken echoed text/plain 200). Dedup proven by re-POSTing the
  // IDENTICAL envelope (unchanged resource re-fetch → same dedup key →
  // dropped). Dedup rows LIKE-cleaned on the smoke-minted subscriptionId
  // prefix. patchMessage's patch type gained the documented optional `flag`
  // field (additive; the wrapper comment already anticipated set_flag reuse).
  {
    provider: "microsoft-outlook",
    type: "new_email",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "ingestion-path cert via DIRECT-SEED + REAL Graph fetch: seed row {subscriptionId, clientState, subject-marker substring filter}, baseline 0, proven stageOutlookSeedMessage self-send resolves the REAL inbox copy, synthetic created-notification to the real /api/webhooks/microsoft-outlook route (clientState verify -> REAL getMessage -> receive-time filters -> normalize -> dispatch) fires exactly 1 run whose trigger_event carries sub:msg:created + the marker subject, terminal 'succeeded', identical re-send deduped (still 1), seed messages deleted + rows cleaned (0 leaked); subscription activation NOT certified, Microsoft did not deliver",
  },
  {
    provider: "microsoft-outlook",
    type: "email_sent",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "ingestion-path cert via DIRECT-SEED + REAL Graph fetch: self-send seed, the REAL Sent Items copy resolved by bounded marker scan, synthetic created-notification through the real route fires exactly 1 run (receive-time subject-marker filter passed on the fetched sent copy; sub:msg:created + marker subject), terminal 'succeeded', identical re-send deduped, both message copies deleted + rows cleaned (0 leaked); subscription activation NOT certified",
  },
  {
    provider: "microsoft-outlook",
    type: "email_flagged",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "ingestion-path cert via DIRECT-SEED + REAL Graph fetch: self-send seed then REAL flag PATCH via the production patchMessage wrapper (flagStatus 'flagged'), synthetic updated-notification through the real route fires exactly 1 run (the receive-time flagStatus==='flagged' gate passed on the REAL fetched message; sub:msg:updated + marker subject), terminal 'succeeded', identical re-send deduped (message still flagged -> same key), seed deleted + rows cleaned (0 leaked); subscription activation NOT certified",
  },
  {
    provider: "microsoft-outlook-calendar",
    type: "event_changed",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "ingestion-path cert via DIRECT-SEED + REAL Graph fetch: certified create_event seeds a REAL 2030-dated marker event (no attendees -> no invites), synthetic updated-notification through the real /api/webhooks/microsoft-outlook-calendar route (clientState verify -> REAL eventsGet -> normalize) fires exactly 1 run carrying sub:event:updated + changeType 'updated' + the marker subject, terminal 'succeeded', identical re-send deduped, event deleted via certified delete_event + rows cleaned (0 leaked); subscription activation NOT certified",
  },
  {
    provider: "microsoft-onedrive",
    type: "file_changed",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "ingestion-path cert via DIRECT-SEED + REAL Graph fetch: certified upload_file seeds a REAL marker-named text file, synthetic updated-notification (resourceData.id -> the route's id-fetch branch) through the real /api/webhooks/microsoft-onedrive route fires exactly 1 run carrying sub:item:<lastModified> + the marker filename, terminal 'succeeded', identical re-send deduped (unchanged item -> same lastModified discriminator), file deleted via certified delete_item + rows cleaned (0 leaked); subscription activation + delta-fallback branch NOT certified",
  },
  {
    provider: "microsoft-teams",
    type: "new_channel_message",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-06",
    note: "ingestion-path cert via DIRECT-SEED + REAL Graph fetch: certified send_channel_message posts a REAL marker message into the smoke channel (SMOKE_TEAMS_TEAM_ID/CHANNEL_ID), synthetic created-notification (chatMessage @odata.type) through the real /api/webhooks/microsoft-teams route (clientState verify -> REAL channel-message fetch via row teamId/channelId -> normalize) fires exactly 1 run carrying sub:msg:created + the marker bodyContent, terminal 'succeeded', identical re-send deduped, rows cleaned; the channel message itself has NO registered delete action -> one crsmoke-marked artifact stays (same disposition as the certified action-smoke); subscription activation NOT certified",
  },
  // Google watch-channel batch (2026-07-07) — all 6 registered Google watch
  // triggers on the generic direct-seed orchestrator + the Google specs
  // (tests/trigger-smoke/googleWatchWebhookSmoke.ts + deps). HYBRID HONESTY
  // SCOPE (Microsoft Graph pattern): the notification is SYNTHETIC
  // (direct-seeded row with smoke-minted channelId; NO files.watch /
  // events.watch created; Google did NOT deliver), but the CURSOR BASELINE is
  // captured live exactly the way each activate hook does and the CHANGED
  // RESOURCE is REAL — seeded via certified actions (create_spreadsheet /
  // append_row / create_document / update_document / upload_file+move_file /
  // create_event; Sheets addSheet via the production batchUpdate wrapper) and
  // re-fetched from LIVE Google by the production receive pulls. Channel-token
  // HMAC verify runs UNWEAKENED via the real buildChannelToken; the local env
  // lacks the deploy-time WATCH_CHANNEL_SECRET so a smoke-local secret is
  // minted in-process (the deployed secret itself is NOT claimed exercised).
  // Watch registration/renewal (files.watch / events.watch / channels.stop)
  // NOT certified. Freshness proven in TWO layers per cert: WATERMARK
  // (identical re-POST vs the ADVANCED cursor pulls nothing) and DEDUP (the
  // exact pre-change cursor/snapshot JSON is RESTORED, the pull RE-DETECTS
  // the same change, and the (provider,eventId) dedup row drops it). The live
  // runs SURFACED + FIXED two production classification bugs: (1)
  // google-drive changes.list's default fields mask omitted createdTime, so
  // fileChanged's created-vs-updated heuristic could never classify
  // "created"; (2) google-calendar's classifyChangeKind compared created ===
  // updated as strings, but live Google stamps created WITHOUT milliseconds
  // and updated WITH them, so "created" was unreachable — now compared at
  // second granularity. Both fixes unit-pinned.
  {
    provider: "google-sheets",
    type: "new_worksheet",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-07",
    note: "ingestion-path cert via DIRECT-SEED + REAL Sheets fetch: certified create_spreadsheet mints the smoke workbook, REAL spreadsheets.get seeds the worksheet-name snapshot (activation parity), baseline 0, a smoke-only addSheet via the production batchUpdate wrapper adds the marker-named sheet, the channel-token-verified synthetic X-Goog notification to the real /api/webhooks/google-sheets route (verify->REAL spreadsheets.get pull->snapshot diff->normalize->dispatch) fires exactly 1 run carrying eventId <ss>:new_worksheet:<sheetId>:<nameHash> + the marker worksheetName, terminal 'succeeded', watermark re-POST fires 0, RESTORED-snapshot re-POST re-detects and dedup drops it (still 1), spreadsheet Drive-trashed + rows cleaned (0 leaked); watch activation NOT certified, Google did not deliver",
  },
  {
    provider: "google-sheets",
    type: "row_changed",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-07",
    note: "ingestion-path cert via DIRECT-SEED + REAL Sheets fetch: smoke workbook + certified append_row baseline row, row config {sheetName, changeKinds:[added], lastRowCount} seeded at activation parity, baseline 0, a certified append_row adds the marker row, the synthetic X-Goog notification to the real route (verify->REAL values.get pull->count delta->normalize) fires exactly 1 run whose payload rowValues carry the marker (legacy added-only eventId <ss>:<sheet>:<row>:<hash>), terminal 'succeeded', watermark re-POST fires 0, RESTORED lastRowCount re-POST re-detects and dedup drops it (still 1), spreadsheet Drive-trashed + rows cleaned (0 leaked); watch activation NOT certified",
  },
  {
    provider: "google-docs",
    type: "new_document",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-07",
    note: "ingestion-path cert via DIRECT-SEED + REAL Drive changes fetch: REAL changes.getStartPageToken baseline (activation parity), baseline 0, certified create_document (empty content — the Docs-create stamps createdTime===modifiedTime) mints the marker-titled doc, a bounded feed-stability probe absorbs Drive's eventual consistency, the synthetic X-Goog notification to the real /api/webhooks/google-docs route (verify->REAL changes.list pull->Docs-mime + created-kind filters->normalize) fires exactly 1 run carrying eventId <docId>:<createdTime> + changeKind 'created' + the marker title, terminal 'succeeded', watermark re-POST fires 0, RESTORED pageToken re-POST re-detects and dedup drops it (still 1), doc Drive-trashed + rows cleaned (0 leaked); watch activation NOT certified",
  },
  {
    provider: "google-docs",
    type: "document_updated",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-07",
    note: "ingestion-path cert via DIRECT-SEED + REAL Drive changes fetch: certified create_document seeds the doc FIRST, then the baseline pageToken (so only the update lands in the delta), row config pins documentId (receive-time narrowing filter), baseline 0, certified update_document inserts marker content (modifiedTime > createdTime), the synthetic notification to the real route fires exactly 1 run carrying eventId <docId>:<modifiedTime> + changeKind 'updated' + the marker title, terminal 'succeeded', watermark re-POST fires 0, RESTORED pageToken re-POST re-detects and dedup drops it (still 1), doc Drive-trashed + rows cleaned (0 leaked); watch activation NOT certified",
  },
  {
    provider: "google-drive",
    type: "file_changed",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-07",
    note: "ingestion-path cert via DIRECT-SEED + REAL Drive changes fetch: certified create_folder mints a run-unique smoke folder and config.folderId scopes the trigger to it (changes.list is WHOLE-drive — live-observed: without the folder scope, the suite's own cleanup trash events legitimately fired it; the parents filter is production normalize behavior), baseline startPageToken, baseline 0, certified upload_file + move_file place the marker file under the watched folder (move changes parents only, so createdTime===modifiedTime -> 'created' — reachable only after the createdTime fields-mask fix this batch landed), feed-stability probe, the synthetic notification to the real /api/webhooks/google-drive route fires exactly 1 run carrying eventId <fileId>:<changeTime> + changeKind 'created' + objectKind 'file' + the marker filename, terminal 'succeeded', watermark re-POST fires 0, RESTORED pageToken re-POST re-detects and dedup drops it (still 1), file+folder Drive-trashed + rows cleaned (0 leaked); watch activation NOT certified",
  },
  {
    provider: "google-calendar",
    type: "event_changed",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-07",
    note: "ingestion-path cert via DIRECT-SEED + REAL Calendar fetch: baseline nextSyncToken captured via the SAME full events.list walk the activate hook does, row config {calendarId primary, syncToken}, baseline 0, certified create_event mints a 2031-dated no-attendee marker event (sendNotifications none), the synthetic X-Goog notification to the real /api/webhooks/google-calendar route (verify->REAL events.list?syncToken delta->normalize) fires exactly 1 run carrying eventId <eventId>:<updated> + changeKind 'created' (reachable only after the second-granularity classification fix this batch landed — live Google stamps created without ms, updated with ms) + the marker summary, terminal 'succeeded', watermark re-POST fires 0, RESTORED syncToken re-POST re-detects and dedup drops it (still 1), event deleted via certified delete_event + rows cleaned (0 leaked); watch activation NOT certified",
  },
  // facebook:new_post / new_comment — Lane C pure direct-seed batch (2026-07-07)
  // on the generic orchestrator (tests/trigger-smoke/facebookWebhookSmoke.ts +
  // facebookWebhookSmokeDeps.ts). The Slack-message-batch policy applies:
  // Facebook PUSHES the change inline and the production path does NO provider
  // fetch, so a fully synthetic FACEBOOK_CLIENT_SECRET-signed feed change
  // exercises the whole ingestion path unweakened — real Page posts would add
  // zero coverage while creating public artifacts. All ids + message text are
  // smoke-minted crsmoke markers. The seeded row's config.pageId matches the
  // synthetic entry, so the registered pageId filter's Zod parse + POSITIVE
  // match ran inside real dispatch. GET hub.challenge probed on its
  // fail-closed branch (wrong token -> 403, challenge never echoed); the
  // positive echo needs FACEBOOK_WEBHOOK_VERIFY_TOKEN, absent from the local
  // env (env-name drift observed: .env.local carries FACEBOOK_PAGES_VERIFY_TOKEN
  // / FACEBOOK_USER_VERIFY_TOKEN instead — deploy-time config to reconcile).
  {
    provider: "facebook",
    type: "new_post",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-07",
    note: "ingestion-path cert via DIRECT-SEED (NOT activation): seed trigger_resources event_type new_post + config{pageId} (smoke-minted), baseline 0, a FACEBOOK_CLIENT_SECRET-signed (sha256= HMAC over raw body) synthetic page feed change (item status, verb add, crsmoke page/post ids + marker message, no real Page/PII) POSTed to the real /api/webhooks/facebook route (verify->classify->normalize->dispatch->pageId filter POSITIVE match->dedup->enqueue) fires exactly 1 run whose trigger_event carries eventId new_post:<page>:<post> + the marker message, durable run terminal 'succeeded', identical re-send deduped (still 1), rows cleaned (0 leaked); no Facebook API, no real Page. Provider-side Page subscription activation NOT certified; Facebook did not deliver.",
  },
  {
    provider: "facebook",
    type: "new_comment",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-07",
    note: "ingestion-path cert via DIRECT-SEED (NOT activation): seed event_type new_comment + config{pageId}, baseline 0, a FACEBOOK_CLIENT_SECRET-signed synthetic feed change (item comment, verb add, crsmoke page/post/comment ids + parent_id + marker message) POSTed to the real /api/webhooks/facebook route classifies to new_comment, fires exactly 1 run whose trigger_event carries eventId new_comment:<page>:<comment> + parentId + the marker message, terminal 'succeeded', identical re-send deduped (still 1), rows cleaned (0 leaked); no Facebook API, no real Page/comment. Provider-side activation NOT certified.",
  },
  // dropbox:new_file — Lane C direct-seed + REAL cursor reconcile (2026-07-07),
  // tests/trigger-smoke/dropboxWebhookSmoke.ts + deps. HYBRID scope: the
  // notification is synthetic (Dropbox did NOT deliver) but the changed-account
  // id is the REAL connected dbid, the seeded cursor comes from the live
  // get_latest_cursor (exactly what activation does — Dropbox webhooks are
  // app-level, activation creates NO provider resource), the smoke file is a
  // REAL upload, and the route's reconcile walked the REAL list_folder/continue
  // delta. The live run also EXERCISED the account-scoped integration-lookup
  // fix in reconcile.ts (was row.userId — user id is not an account id, so
  // production reconciliation always found no integration and silently
  // dispatched nothing; fixed to row.workflowAccountId, unit-pinned).
  {
    provider: "dropbox",
    type: "new_file",
    activation: "webhook",
    status: "LIVE_PASS",
    date: "2026-07-07",
    note: "ingestion-path cert via DIRECT-SEED + REAL cursor reconcile: certified create_folder mints a run-unique smoke folder, REAL get_latest_cursor seeds snapshot{cursor, accountId=real dbid}, baseline 0, REAL marker-file upload + a DROPBOX_CLIENT_SECRET-signed (hex HMAC over raw body) synthetic {list_folder:{accounts:[dbid]}} POSTed to the real /api/webhooks/dropbox route (verify->account fan-out->REAL list_folder/continue->path scope->state gate->row-scoped dedup->enqueue) fires exactly 1 run whose trigger_event carries eventId new_file:<dbid>:<fileId>:<rev> + the marker filename, terminal 'succeeded', re-send vs ADVANCED cursor fires 0 (watermark), RESTORED pre-change cursor re-send re-surfaces the entry and the rowId:file:rev dedup drops it (still 1), GET ?challenge echo probed live, folder+file trashed + rows cleaned (0 leaked); surfaced+fixed the reconcile account-lookup bug (row.userId -> workflowAccountId). Provider-side App Console webhook registration NOT certified; Dropbox did not deliver.",
  },
  // mailchimp:new_audience / email_opened / link_clicked — BLOCKED for smoke
  // certification (probe-read 2026-07-06):
  //   - new_audience fires on a NEW audience (list) created after baseline;
  //     the smoke account has NO free audience slot (create_audience is
  //     BLOCKED_ENV on the same account — Mailchimp plan audience limit), so
  //     the observable cannot be seeded.
  //   - email_opened / link_clicked watch SENT campaigns' report aggregates
  //     (reportSummary opens/clicks); certifying would require actually
  //     SENDING a campaign (a real broadcast — out of smoke policy) AND real
  //     recipient open/click engagement plus Mailchimp report latency, none
  //     of which can be honestly seeded.
  {
    provider: "mailchimp",
    type: "new_audience",
    activation: "polling",
    status: "MISSING_HARNESS",
    note: "BLOCKED: needs a NEW audience created post-baseline; smoke account has no audience slot (plan limit — create_audience is BLOCKED_ENV on the same account). Certify when a slot exists or on a paid test account.",
  },
  {
    provider: "mailchimp",
    type: "email_opened",
    activation: "polling",
    status: "MISSING_HARNESS",
    note: "BLOCKED: watches SENT campaigns' report open totals; seeding requires a real campaign SEND (broadcast — out of smoke policy) + real recipient opens + report latency. Not honestly seedable; needs a Phase-13-style live cert with a controlled recipient.",
  },
  {
    provider: "mailchimp",
    type: "link_clicked",
    activation: "polling",
    status: "MISSING_HARNESS",
    note: "BLOCKED: watches SENT campaigns' report click totals; same send+engagement requirements as email_opened. Not honestly seedable; needs a Phase-13-style live cert with a controlled recipient.",
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
  // QUICKBOOKS-1 (2026-07-07) — 4 app-level webhook triggers, seeded at
  // implementation time. QuickBooks webhooks are APP-LEVEL (Intuit portal
  // endpoint + verifier token per environment; NO per-workflow provider
  // webhook), payloads are compact (entity name/id/operation only), and the
  // receive path MUST post-fetch each entity through refreshAndRetry — which
  // requires an ACTIVE connected QuickBooks integration whose
  // provider_account_id matches the event's realmId. Without owner setup
  // (Intuit app + sandbox company + QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN), a
  // synthetic signed POST yields zero dispatches by design (no integration ->
  // enrichment drop) — nothing to certify without faking the provider fetch,
  // which would NOT be the real path (airtable:record_changed precedent).
  // The signature-verify / parse / enrich-mapping / invoice_paid-derivation /
  // realm-filter / dedup layers are unit-tested in
  // tests/unit/integrations/quickbooks/webhooks/*. Certification needs the
  // Phase-13 live cert (real OAuth, real portal webhook, real sandbox
  // customer/invoice/payment events).
  {
    provider: "quickbooks",
    type: "customer_created",
    activation: "webhook",
    status: "MISSING_HARNESS",
    note: "BLOCKED for direct-seed: compact Intuit payloads force a post-fetch enrichment that needs a live connected realm-matched integration; not honestly seedable pre-owner-setup. Signature/parse/mapping/realm-filter layers unit-tested; needs Phase-13 live cert (real portal webhook + sandbox events).",
  },
  {
    provider: "quickbooks",
    type: "invoice_created",
    activation: "webhook",
    status: "MISSING_HARNESS",
    note: "BLOCKED for direct-seed: same enrichment requirement as customer_created. Needs Phase-13 live cert (real sandbox invoice creation through the portal webhook).",
  },
  {
    provider: "quickbooks",
    type: "payment_received",
    activation: "webhook",
    status: "MISSING_HARNESS",
    note: "BLOCKED for direct-seed: same enrichment requirement. Needs Phase-13 live cert (real sandbox payment through the portal webhook).",
  },
  {
    provider: "quickbooks",
    type: "invoice_paid",
    activation: "webhook",
    status: "MISSING_HARNESS",
    note: "BLOCKED for direct-seed: DERIVED trigger (payment -> linked invoices -> verified zero balance) doubles the enrichment requirement. Derivation incl. partial-payment no-fire + invoice-identity dedup is unit-tested; needs Phase-13 live cert (real sandbox payment fully paying an invoice, partial-payment no-fire, Create+Update single-fire).",
  },
];
